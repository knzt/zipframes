import { createPublisher } from '@zipframes/communication';
import { createLogger } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';
import { randomUUID } from 'node:crypto';

import { createProcessUploadedVideo } from '../application/use-cases/process-uploaded-video.js';
import { loadConfig } from '../infrastructure/config.js';
import { createAmqpEventPublisher } from '../infrastructure/gateways/amqp-event-publisher.js';
import { createFfmpegFrameExtractor } from '../infrastructure/gateways/ffmpeg-frame-extractor.js';
import { createFsWorkDirectory } from '../infrastructure/gateways/fs-work-directory.js';
import { createS3ObjectStorage } from '../infrastructure/gateways/s3-object-storage.js';
import { createZipArchiveBuilder } from '../infrastructure/gateways/zip-archive-builder.js';
import { startHealthServer, startMetricsServer } from '../infrastructure/http/health.js';
import { createRabbitMqConnection } from '../infrastructure/messaging/rabbitmq-connection.js';
import { createProcessorTopology, UPLOADED_QUEUE } from '../infrastructure/messaging/topology.js';
import { createVideoUploadedConsumer } from '../infrastructure/messaging/video-uploaded-consumer.js';
import { createJobMetrics } from '../infrastructure/observability/job-metrics.js';

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

  const connection = await createRabbitMqConnection(config.amqpUrl);
  await connection.assertTopology(createProcessorTopology());

  const createId = (): string => randomUUID();
  const now = (): Date => new Date();
  const publisher = createPublisher(connection);
  const events = createAmqpEventPublisher({ publisher, createId, now });

  const storage = createS3ObjectStorage({
    endpoint: config.s3Endpoint,
    region: config.s3Region,
    accessKey: config.s3AccessKey,
    secretKey: config.s3SecretKey,
    bucket: config.s3Bucket,
    forcePathStyle: config.s3ForcePathStyle,
  });

  const processUploadedVideo = createProcessUploadedVideo({
    storage,
    extractor: createFfmpegFrameExtractor(),
    archive: createZipArchiveBuilder(),
    workDirectory: createFsWorkDirectory(config.workDir),
    events,
    now,
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
  });

  const consumer = createVideoUploadedConsumer({
    processUploadedVideo,
    events,
    retry: {
      maxAttempts: config.maxAttempts,
      baseDelayMs: config.retryBaseDelayMs,
      maxDelayMs: config.retryMaxDelayMs,
    },
    logger,
    metrics: jobMetrics,
  });

  await connection.consume(UPLOADED_QUEUE, consumer, {
    retry: {
      maxAttempts: config.maxAttempts,
      baseDelayMs: config.retryBaseDelayMs,
      maxDelayMs: config.retryMaxDelayMs,
    },
  });

  const healthServer = startHealthServer(config.healthPort, {
    isAmqpConnected: () => connection.isConnected(),
    pingStorage: () => storage.ping(),
  });
  const metricsServer = startMetricsServer(config.metricsPort, () =>
    technicalMetrics.registry.metrics(),
  );

  logger.info('processor-worker started', {
    queue: UPLOADED_QUEUE,
    healthPort: config.healthPort,
    metricsPort: config.metricsPort,
  });

  return {
    stop: async () => {
      await new Promise<void>((resolve, reject) => {
        healthServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }).catch(() => undefined);
      await new Promise<void>((resolve, reject) => {
        metricsServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }).catch(() => undefined);
      await connection.close();
      logger.info('processor-worker stopped');
    },
  };
};
