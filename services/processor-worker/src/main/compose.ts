import { createPublisher, createDefaultTopology } from '@zipframes/communication';
import { createLogger } from '@zipframes/logger';
import { randomUUID } from 'node:crypto';

import { createRabbitMqBroker } from '../adapters/messaging/rabbitmq-broker.js';
import { createUploadedVideoHandler } from '../adapters/messaging/uploaded-video-handler.js';
import { createFfmpegFrameExtractor } from '../adapters/processing/ffmpeg-frame-extractor.js';
import { createFsWorkDirectory } from '../adapters/processing/fs-work-directory.js';
import { createZipArchiveBuilder } from '../adapters/processing/zip-archive-builder.js';
import { createS3ObjectStorage } from '../adapters/storage/s3-object-storage.js';
import { createProcessUploadedVideo } from '../application/process-uploaded-video.js';
import { loadConfig, UPLOADED_QUEUE } from '../frameworks/config.js';

export const startWorker = async (): Promise<{ stop: () => Promise<void> }> => {
  const config = loadConfig();
  const logger = createLogger({
    service: 'processor-worker',
    version: config.serviceVersion,
    level: config.logLevel,
  });

  const broker = await createRabbitMqBroker(config.amqpUrl);
  const topology = createDefaultTopology({
    consumerQueues: [{ name: UPLOADED_QUEUE, routingKeys: ['video.uploaded'] }],
  });
  await broker.assertTopology(topology);

  const publisher = createPublisher(broker);
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
    publisher,
    now: () => new Date(),
    createId: () => randomUUID(),
    processingTimeoutMs: config.processingTimeoutMs,
  });

  const handler = createUploadedVideoHandler({
    processUploadedVideo,
    publisher,
    retry: {
      maxAttempts: config.maxAttempts,
      baseDelayMs: config.retryBaseDelayMs,
      maxDelayMs: config.retryMaxDelayMs,
    },
    createId: () => randomUUID(),
    now: () => new Date(),
  });

  await broker.consume(UPLOADED_QUEUE, handler);
  logger.info('processor-worker started', { queue: UPLOADED_QUEUE });

  return {
    stop: async () => {
      await broker.close();
      logger.info('processor-worker stopped');
    },
  };
};
