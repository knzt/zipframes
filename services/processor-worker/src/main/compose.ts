import { createPublisher } from '@zipframes/communication';
import { createReadinessCheck } from '@zipframes/core';
import type { Pingable } from '@zipframes/core';
import { createLogger } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';
import { randomUUID } from 'node:crypto';

import { createProcessUploadedVideo } from '../application/useCases/processUploadedVideo/processUploadedVideo.useCase.js';
import { loadConfig } from '../infrastructure/config.js';
import { createAmqpEventPublisher } from '../infrastructure/gateways/amqpEventPublisher.gateway.js';
import { createFfmpegFrameExtractor } from '../infrastructure/gateways/media/ffmpegFrameExtractor.gateway.js';
import { createS3ObjectStorage } from '../infrastructure/gateways/storage/s3ObjectStorage.gateway.js';
import { createFsWorkDirectory } from '../infrastructure/services/filesystem/fsWorkDirectory.service.js';
import { createZipArchiveBuilder } from '../infrastructure/services/media/zipArchiveBuilder.service.js';
import { startHealthServer } from '../infrastructure/http/health.routes.js';
import { createRabbitMqConnection } from '../infrastructure/messaging/rabbitmqConnection.js';
import { createProcessorTopology, UPLOADED_QUEUE } from '../infrastructure/messaging/topology.js';
import { createVideoUploadedConsumer } from '../infrastructure/messaging/videoUploadedConsumer.js';
import { createJobMetrics } from '../infrastructure/observability/jobMetrics.js';

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

  const amqpPing: Pingable = {
    ping: () => {
      if (!connection.isConnected()) {
        return Promise.reject(new Error('amqp disconnected'));
      }
      return Promise.resolve();
    },
  };
  const isReady = createReadinessCheck([amqpPing, storage]);

  const healthServer = await startHealthServer(config.healthPort, {
    isReady,
    renderMetrics: () => technicalMetrics.registry.metrics(),
  });

  logger.info('processor-worker started', {
    queue: UPLOADED_QUEUE,
    healthPort: config.healthPort,
  });

  return {
    stop: async () => {
      await healthServer.close().catch(() => undefined);
      await connection.close();
      logger.info('processor-worker stopped');
    },
  };
};
