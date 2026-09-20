import { createPublisher, createDefaultTopology } from '@zipframes/communication';
import { createLogger } from '@zipframes/logger';
import { randomUUID } from 'node:crypto';

import { createAmqpEventPublisher } from '../infrastructure/gateways/amqp-event-publisher.js';
import { createFfmpegFrameExtractor } from '../infrastructure/gateways/ffmpeg-frame-extractor.js';
import { createFsWorkDirectory } from '../infrastructure/gateways/fs-work-directory.js';
import { createS3ObjectStorage } from '../infrastructure/gateways/s3-object-storage.js';
import { createZipArchiveBuilder } from '../infrastructure/gateways/zip-archive-builder.js';
import { createRabbitMqConnection } from '../infrastructure/messaging/rabbitmq-connection.js';
import { createVideoUploadedConsumer } from '../infrastructure/messaging/video-uploaded-consumer.js';
import { createProcessUploadedVideo } from '../application/use-cases/process-uploaded-video.js';
import { loadConfig, UPLOADED_QUEUE } from '../infrastructure/config.js';

export const startWorker = async (): Promise<{ stop: () => Promise<void> }> => {
  const config = loadConfig();
  const logger = createLogger({
    service: 'processor-worker',
    version: config.serviceVersion,
    level: config.logLevel,
  });

  const connection = await createRabbitMqConnection(config.amqpUrl);
  const topology = createDefaultTopology({
    consumerQueues: [{ name: UPLOADED_QUEUE, routingKeys: ['video.uploaded'] }],
  });
  await connection.assertTopology(topology);

  const createId = (): string => randomUUID();
  const now = (): Date => new Date();
  const publisher = createPublisher(connection);
  const events = createAmqpEventPublisher({ publisher, createId, now });

  const processUploadedVideo = createProcessUploadedVideo({
    storage: createS3ObjectStorage({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      bucket: config.s3Bucket,
      forcePathStyle: config.s3ForcePathStyle,
    }),
    extractor: createFfmpegFrameExtractor(),
    archive: createZipArchiveBuilder(),
    workDirectory: createFsWorkDirectory(config.workDir),
    events,
    now,
    processingTimeoutMs: config.processingTimeoutMs,
  });

  const consumer = createVideoUploadedConsumer({
    processUploadedVideo,
    events,
    retry: {
      maxAttempts: config.maxAttempts,
      baseDelayMs: config.retryBaseDelayMs,
      maxDelayMs: config.retryMaxDelayMs,
    },
  });

  await connection.consume(UPLOADED_QUEUE, consumer);
  logger.info('processor-worker started', { queue: UPLOADED_QUEUE });

  return {
    stop: async () => {
      await connection.close();
      logger.info('processor-worker stopped');
    },
  };
};
