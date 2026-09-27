import type { RetryOptions } from '@zipframes/communication';
import { createReadinessCheck } from '@zipframes/core';
import { createLogger, runWithCorrelationId } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';

import { bindHttpRoutes } from '../infrastructure/http/fastify/bindHttpRoutes.js';
import { registerHealthRoutes } from '../infrastructure/http/fastify/health.routes.js';
import { createHttpServer } from '../infrastructure/http/fastify/server.js';
import { videoRoutes } from '../infrastructure/http/routes/videoRoutes.js';
import { loadConfig } from '../infrastructure/loadEnvConfig.js';
import {
  createVideoServiceAmqpTopology,
  PROCESSING_STATUS_QUEUE,
  PROCESSING_STATUS_RETRY_QUEUE,
} from '../infrastructure/messaging/amqplib/amqpTopology.js';
import { createProcessingStatusObserver } from '../infrastructure/observability/processingStatusObserver.js';
import { startIntervalJob } from '../infrastructure/scheduling/intervalJob.js';
import { createApplyProcessingEventController } from './factories/controllers/applyProcessingEventController.js';
import { createConfirmUploadController } from './factories/controllers/confirmUploadController.js';
import { createDeleteVideoController } from './factories/controllers/deleteVideoController.js';
import { createGetDownloadUrlController } from './factories/controllers/getDownloadUrlController.js';
import { createGetVideoController } from './factories/controllers/getVideoController.js';
import { createListUserVideosController } from './factories/controllers/listUserVideosController.js';
import { createRequestUploadController } from './factories/controllers/requestUploadController.js';
import { createAmqplib, createAmqpPing } from './factories/externals/amqplib.js';
import { createJwtAuthenticator } from './factories/externals/authenticator.js';
import { createPrisma, createPrismaPing } from './factories/externals/prisma.js';
import { createRedis } from './factories/externals/redis.js';
import { createS3 } from './factories/externals/s3.js';
import { createEventPublisherGateway } from './factories/gateways/eventPublisherGateway.js';
import { createObjectStorageGateway } from './factories/gateways/objectStorageGateway.js';
import { createVideoListCacheGateway } from './factories/gateways/videoListCacheGateway.js';
import { createExpireFramesPackagesUseCase } from './factories/use-cases/expireFramesPackagesUseCase.js';

const HOUR_MS = 60 * 60 * 1000;

export const startVideoService = async (): Promise<{ stop: () => Promise<void> }> => {
  const config = loadConfig();
  const logger = createLogger({
    service: 'video-service',
    version: config.serviceVersion,
    level: config.logLevel,
  });
  const technicalMetrics = createMetrics({
    service: 'video-service',
    version: config.serviceVersion,
  });
  const retry: RetryOptions = {
    maxAttempts: config.maxAttempts,
    baseDelayMs: config.retryBaseDelayMs,
    maxDelayMs: config.retryMaxDelayMs,
  };

  const closers: (() => Promise<void>)[] = [];

  try {
    const prisma = createPrisma(config.databaseUrl);
    closers.push(() => prisma.$disconnect());

    const amqp = await createAmqplib(config.amqpUrl, config.consumerPrefetch);
    closers.push(() => amqp.close());
    await amqp.assertTopology(createVideoServiceAmqpTopology());

    const redis = createRedis(config.redisUrl, logger);
    closers.push(() => {
      redis.disconnect();
      return Promise.resolve();
    });

    const s3Credentials = {
      region: config.s3Region,
      accessKey: config.s3AccessKey,
      secretKey: config.s3SecretKey,
      forcePathStyle: config.s3ForcePathStyle,
    };

    // Opened once and shared: each controller factory takes what it needs.
    const externals = {
      prisma,
      s3: createS3({ ...s3Credentials, endpoint: config.s3Endpoint }),
      publicS3: createS3({ ...s3Credentials, endpoint: config.s3PublicEndpoint }),
      bucket: config.s3Bucket,
      eventPublisher: createEventPublisherGateway(amqp),
      videoListCache: createVideoListCacheGateway({
        redis,
        ttlSeconds: config.listCacheTtlSeconds,
        logger,
      }),
      authenticator: createJwtAuthenticator({
        jwksUrl: config.jwksUrl,
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
      }),
      maxUploadBytes: config.maxUploadBytes,
      uploadUrlTtlSeconds: config.uploadUrlTtlSeconds,
      downloadUrlTtlSeconds: config.downloadUrlTtlSeconds,
      retentionMs: config.resultRetentionHours * HOUR_MS,
      expirationBatchSize: config.expirationBatchSize,
    };

    const app = await createHttpServer({
      corsOrigin: config.corsOrigin,
      logger,
      version: config.serviceVersion,
      metrics: technicalMetrics,
    });
    closers.push(() => app.close());
    bindHttpRoutes(
      app,
      videoRoutes({
        requestUpload: createRequestUploadController(externals),
        confirmUpload: createConfirmUploadController(externals),
        listUserVideos: createListUserVideosController(externals),
        getVideo: createGetVideoController(externals),
        getDownloadUrl: createGetDownloadUrlController(externals),
        deleteVideo: createDeleteVideoController(externals),
      }),
    );
    registerHealthRoutes(app, {
      // Redis is left out on purpose: without it the list still answers.
      isReady: createReadinessCheck([
        createPrismaPing(prisma),
        createAmqpPing(amqp),
        createObjectStorageGateway(externals),
      ]),
      renderMetrics: () => technicalMetrics.registry.metrics(),
      logger,
    });

    const applyProcessingEventController = createApplyProcessingEventController({
      ...externals,
      handlerOptions: {
        retry,
        runInContext: (event, run) => runWithCorrelationId(event.correlationId, run),
        onOutcome: createProcessingStatusObserver({ logger, metrics: technicalMetrics }),
      },
    });
    await amqp.consume(PROCESSING_STATUS_QUEUE, applyProcessingEventController.handle, {
      retry,
      waitQueue: PROCESSING_STATUS_RETRY_QUEUE,
    });

    const expireFramesPackages = createExpireFramesPackagesUseCase({
      ...externals,
      onExpireFailed: (videoId, error) => {
        logger.error('failed to expire frames package', { videoId, err: error });
      },
    });
    const expirationJob = startIntervalJob(
      async () => {
        const { expired, failed } = await expireFramesPackages.execute();
        if (expired > 0 || failed > 0) {
          logger.info('expiration sweep finished', { expired, failed });
        }
      },
      config.expirationSweepIntervalMs,
      (error) => {
        logger.error('expiration sweep failed', { err: error });
      },
    );
    closers.push(() => expirationJob.stop());

    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info('video-service listening', { port: config.port, queue: PROCESSING_STATUS_QUEUE });

    return {
      stop: async () => {
        await app.close();
        await expirationJob.stop();
        await amqp.close();
        redis.disconnect();
        await prisma.$disconnect();
        logger.info('video-service stopped');
      },
    };
  } catch (error) {
    for (const close of [...closers].reverse()) {
      await close().catch(() => undefined);
    }
    throw error;
  }
};
