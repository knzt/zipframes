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

    const s3 = createS3({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      forcePathStyle: config.s3ForcePathStyle,
    });

    const processUploadedVideoController = createProcessUploadedVideoController({
      connection,
      s3,
      config,
      logger,
      technicalMetrics,
    });

    const consumer = createVideoUploadedConsumer({
      controller: processUploadedVideoController,
      events: createEventPublisher(connection),
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
