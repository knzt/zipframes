import type { RetryOptions } from '@zipframes/communication';
import { createReadinessCheck } from '@zipframes/core';
import { createLogger, runWithCorrelationId } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';

import { startOperationsServer } from '../infrastructure/http/operationsServer.js';
import { loadConfig } from '../infrastructure/loadEnvConfig.js';
import { createAmqpPing } from '../infrastructure/messaging/amqplib/connection.js';
import {
  createProcessorAmqpTopology,
  UPLOADED_QUEUE,
} from '../infrastructure/messaging/amqplib/amqpTopology.js';
import { createJobMetrics } from '../infrastructure/observability/jobMetrics.js';
import { createVideoProcessingObserver } from '../infrastructure/observability/videoProcessingObserver.js';
import { createProcessUploadedVideoController } from './factories/controllers/processUploadedVideoController.js';
import { createAmqplib } from './factories/externals/amqplib.js';
import { createS3 } from './factories/externals/s3.js';
import { createEventPublisherGateway } from './factories/gateways/eventPublisherGateway.js';
import { createObjectStorageGateway } from './factories/gateways/objectStorageGateway.js';

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
    const amqp = await createAmqplib(config.amqpUrl);
    closers.push(() => amqp.close());
    await amqp.assertTopology(createProcessorAmqpTopology());

    const s3 = createS3({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      forcePathStyle: config.s3ForcePathStyle,
    });
    const eventPublisher = createEventPublisherGateway(amqp);

    const processUploadedVideoController = createProcessUploadedVideoController({
      s3,
      eventPublisher,
      bucket: config.s3Bucket,
      workDir: config.workDir,
      processingTimeoutMs: config.processingTimeoutMs,
      handlerOptions: {
        retry,
        runInContext: (event, run) => runWithCorrelationId(event.correlationId, run),
        onOutcome: createVideoProcessingObserver({ logger, metrics: jobMetrics }),
      },
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
    });

    await amqp.consume(UPLOADED_QUEUE, processUploadedVideoController.handle, { retry });

    const operations = await startOperationsServer({
      port: config.operationsPort,
      isReady: createReadinessCheck([
        createAmqpPing(amqp),
        createObjectStorageGateway({ s3, bucket: config.s3Bucket }),
      ]),
      renderMetrics: () => technicalMetrics.registry.metrics(),
      logger,
    });
    closers.push(() => operations.close());

    logger.info('processor-worker started', {
      queue: UPLOADED_QUEUE,
      operationsPort: operations.port,
    });

    return {
      stop: async () => {
        await operations.close();
        await amqp.close();
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
