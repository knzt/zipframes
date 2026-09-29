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
  IDENTITY_EVENTS_QUEUE,
  IDENTITY_EVENTS_RETRY_QUEUE,
  PROCESSING_STATUS_QUEUE,
  PROCESSING_STATUS_RETRY_QUEUE,
} from '../infrastructure/messaging/amqplib/amqpTopology.js';
import { createIdentityEventObserver } from '../infrastructure/observability/identityEventObserver.js';
import { createProcessingStatusObserver } from '../infrastructure/observability/processingStatusObserver.js';
import { startIntervalJob } from '../infrastructure/scheduling/intervalJob.js';
import { createApplyProcessingEventController } from './factories/controllers/applyProcessingEventController.js';
import { createDeleteVideoController } from './factories/controllers/deleteVideoController.js';
import { createGetDownloadUrlController } from './factories/controllers/getDownloadUrlController.js';
import { createGetVideoController } from './factories/controllers/getVideoController.js';
import { createListUserVideosController } from './factories/controllers/listUserVideosController.js';
import { createUploadVideoController } from './factories/controllers/uploadVideoController.js';
import { createUserDeletedController } from './factories/controllers/userDeletedController.js';
import { createAmqplib, createAmqpPing } from './factories/externals/amqplib.js';
import { createJwtAuthenticator } from './factories/externals/authenticator.js';
import { createPrisma, createPrismaPing } from './factories/externals/prisma.js';
import { createRedis } from './factories/externals/redis.js';
import { createS3 } from './factories/externals/s3.js';
import { createEventPublisherGateway } from './factories/gateways/eventPublisherGateway.js';
import { createObjectStorageGateway } from './factories/gateways/objectStorageGateway.js';
import { createVideoListCacheGateway } from './factories/gateways/videoListCacheGateway.js';
import { createExpireFramesPackagesUseCase } from './factories/use-cases/expireFramesPackagesUseCase.js';

export interface RunningVideoService {
  /** Where the HTTP server listens; with `PORT=0` it carries the port the system picked. */
  readonly url: string;
  readonly stop: () => Promise<void>;
}

export const startVideoService = async (): Promise<RunningVideoService> => {
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
      downloadUrlTtlSeconds: config.downloadUrlTtlSeconds,
      retentionMs: config.resultRetentionSeconds * 1000,
      expirationBatchSize: config.expirationBatchSize,
    };

    const app = await createHttpServer({
      corsOrigin: config.corsOrigin,
      logger,
      version: config.serviceVersion,
      maxUploadBytes: config.maxUploadBytes,
      metrics: technicalMetrics,
    });
    closers.push(() => app.close());
    bindHttpRoutes(
      app,
      videoRoutes({
        uploadVideo: createUploadVideoController(externals),
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

    const userDeletedController = createUserDeletedController({
      ...externals,
      handlerOptions: {
        retry,
        runInContext: (event, run) => runWithCorrelationId(event.correlationId, run),
        onOutcome: createIdentityEventObserver({ logger }),
      },
    });
    await amqp.consume(IDENTITY_EVENTS_QUEUE, userDeletedController.handle, {
      retry,
      waitQueue: IDENTITY_EVENTS_RETRY_QUEUE,
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

    const url = await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info('video-service listening', { url, queue: PROCESSING_STATUS_QUEUE });

    return {
      url,
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
