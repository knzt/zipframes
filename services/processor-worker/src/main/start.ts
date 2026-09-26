import type { RetryOptions } from '@zipframes/communication';
import { createLogger } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';

import { loadConfig } from '../infrastructure/loadEnvConfig.js';
import { createProcessorTopology, UPLOADED_QUEUE } from '../infrastructure/messaging/topology.js';
import { createVideoUploadedConsumer } from '../infrastructure/messaging/videoUploadedConsumer.js';
import { createJobMetrics } from '../infrastructure/observability/jobMetrics.js';
import { createProcessUploadedVideoController } from './factories/controllers/processUploadedVideo.js';
import { createAmqp } from './factories/externals/amqp.js';
import { createS3 } from './factories/externals/s3.js';
import { createEventPublisher } from './factories/gateways/eventPublisher.js';
import { createFrameExtractor } from './factories/gateways/frameExtractor.js';
import { createObjectStorage } from './factories/gateways/objectStorage.js';
import { createArchiveBuilder } from './factories/services/archiveBuilder.js';
import { createClock } from './factories/services/clock.js';
import { createIdGenerator } from './factories/services/idGenerator.js';
import { createWorkDirectory } from './factories/services/workDirectory.js';
import { createProcessUploadedVideo } from './factories/use-cases/processUploadedVideo.js';

export const startWorker = async (): Promise<{ stop: () => Promise<void> }> => {
  const config = loadConfig();
  const logger = createLogger({
    service: 'processor-worker',
    version: config.serviceVersion,
    level: config.logLevel,
  });
  const technicalMetrics = createMetrics({
    service: 'processor-worker',
    version: config.serviceVersion,
  });
  const jobMetrics = createJobMetrics(technicalMetrics);
  const retry: RetryOptions = {
    maxAttempts: config.maxAttempts,
    baseDelayMs: config.retryBaseDelayMs,
    maxDelayMs: config.retryMaxDelayMs,
  };

  const closers: (() => Promise<void>)[] = [];

  try {
    const connection = await createAmqp(config.amqpUrl);
    closers.push(() => connection.close());
    await connection.assertTopology(createProcessorTopology());

    const clock = createClock();
    const idGenerator = createIdGenerator();
    const events = createEventPublisher({ connection, clock, idGenerator });
    const s3 = createS3({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      forcePathStyle: config.s3ForcePathStyle,
    });
    const storage = createObjectStorage(s3, config.s3Bucket);

    const processUploadedVideoController = createProcessUploadedVideoController(
      createProcessUploadedVideo({
        storage,
        extractor: createFrameExtractor(),
        archive: createArchiveBuilder(),
        workDirectory: createWorkDirectory(config.workDir),
        events,
        now: () => clock.now(),
        processingTimeoutMs: config.processingTimeoutMs,
        onDiscardOriginalFailed: (job, error) => {
          logger.error('failed to discard original object after processing', {
            videoId: job.videoId,
            sourceKey: job.sourceKey,
            errorCode: error instanceof Error ? error.message : 'unknown',
          });
          technicalMetrics.messagesHandledTotal.inc({
            destination: UPLOADED_QUEUE,
            outcome: 'delete_original_failed',
          });
        },
      }),
    );

    const consumer = createVideoUploadedConsumer({
      controller: processUploadedVideoController,
      events,
      retry,
      logger,
      metrics: jobMetrics,
    });

    await connection.consume(UPLOADED_QUEUE, consumer, { retry });

    logger.info('processor-worker started', {
      queue: UPLOADED_QUEUE,
    });

    return {
      stop: async () => {
        await connection.close();
        logger.info('processor-worker stopped');
      },
    };
  } catch (error) {
    for (const close of [...closers].reverse()) {
      await close().catch(() => undefined);
    }
    throw error;
  }
};
