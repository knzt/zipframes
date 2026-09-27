import { exec } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { createAuthenticatorFromKey } from '@zipframes/authenticator';
import { startPostgres, startRabbitMq, startRedis, startS3 } from '@zipframes/test-toolkit';
import type {
  PostgresHandle,
  RabbitMqHandle,
  RedisHandle,
  S3Handle,
} from '@zipframes/test-toolkit';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';

import { bindHttpRoutes } from '../../src/infrastructure/http/fastify/bindHttpRoutes.js';
import { registerHealthRoutes } from '../../src/infrastructure/http/fastify/health.routes.js';
import { createHttpServer } from '../../src/infrastructure/http/fastify/server.js';
import { videoRoutes } from '../../src/infrastructure/http/routes/videoRoutes.js';
import {
  createVideoServiceAmqpTopology,
  PROCESSING_STATUS_QUEUE,
  PROCESSING_STATUS_RETRY_QUEUE,
} from '../../src/infrastructure/messaging/amqplib/amqpTopology.js';
import { createApplyProcessingEventController } from '../../src/main/factories/controllers/applyProcessingEventController.js';
import { createConfirmUploadController } from '../../src/main/factories/controllers/confirmUploadController.js';
import { createDeleteVideoController } from '../../src/main/factories/controllers/deleteVideoController.js';
import { createGetDownloadUrlController } from '../../src/main/factories/controllers/getDownloadUrlController.js';
import { createGetVideoController } from '../../src/main/factories/controllers/getVideoController.js';
import { createListUserVideosController } from '../../src/main/factories/controllers/listUserVideosController.js';
import { createRequestUploadController } from '../../src/main/factories/controllers/requestUploadController.js';
import { createAmqplib, type Amqplib } from '../../src/main/factories/externals/amqplib.js';
import { createPrisma, type Prisma } from '../../src/main/factories/externals/prisma.js';
import { createRedis } from '../../src/main/factories/externals/redis.js';
import { createS3, type S3 } from '../../src/main/factories/externals/s3.js';
import { createEventPublisherGateway } from '../../src/main/factories/gateways/eventPublisherGateway.js';
import { createVideoListCacheGateway } from '../../src/main/factories/gateways/videoListCacheGateway.js';
import { silentLogger } from './silent-logger.js';

const execAsync = promisify(exec);

export const BUCKET = 'videos';
export const MAX_UPLOAD_BYTES = 1024 * 1024;
const ISSUER = 'https://auth.zipframes.test';
const AUDIENCE = 'zipframes';

export interface VideoApp {
  readonly baseUrl: string;
  readonly amqpUri: string;
  readonly prisma: Prisma;
  readonly s3: S3;
  /** Signs an access token for `sub`, the way the auth-service does. */
  readonly tokenFor: (sub: string) => Promise<string>;
  readonly stop: () => Promise<void>;
}

/**
 * The video-service wired with the same factories as `start.ts`, against
 * real Postgres, RabbitMQ, SeaweedFS and Redis. Only the JWKS is local: the
 * test signs its own tokens instead of standing up the auth-service.
 */
export const startVideoApp = async (): Promise<VideoApp> => {
  const [postgres, rabbit, storage, redisHandle]: [
    PostgresHandle,
    RabbitMqHandle,
    S3Handle,
    RedisHandle,
  ] = await Promise.all([startPostgres(), startRabbitMq(), startS3(), startRedis()]);

  await execAsync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../../'),
    env: { ...process.env, VIDEO_DATABASE_URL: postgres.connectionUri },
  });

  const logger = silentLogger();
  const prisma = createPrisma(postgres.connectionUri);
  const s3 = createS3({
    endpoint: storage.endpoint,
    region: storage.region,
    accessKey: storage.accessKey,
    secretKey: storage.secretKey,
    forcePathStyle: true,
  });
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));

  const amqp: Amqplib = await createAmqplib(rabbit.amqpUri, 10);
  await amqp.assertTopology(createVideoServiceAmqpTopology());
  const redis = createRedis(redisHandle.url, logger);

  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = { ...(await exportJWK(publicKey)), kid: 'test-1', alg: 'RS256' };
  const authenticator = createAuthenticatorFromKey(createLocalJWKSet({ keys: [publicJwk] }), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  const externals = {
    prisma,
    s3,
    // Tests and the service reach the same endpoint, unlike Compose.
    publicS3: s3,
    bucket: BUCKET,
    eventPublisher: createEventPublisherGateway(amqp),
    videoListCache: createVideoListCacheGateway({ redis, ttlSeconds: 60, logger }),
    authenticator,
    maxUploadBytes: MAX_UPLOAD_BYTES,
    uploadUrlTtlSeconds: 900,
    downloadUrlTtlSeconds: 300,
    retentionMs: 24 * 60 * 60 * 1000,
  };

  const app = await createHttpServer({ corsOrigin: '*', logger, version: '0.0.0' });
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
    isReady: () => Promise.resolve({ ready: true }),
    renderMetrics: () => Promise.resolve(''),
  });

  const retry = { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 200 };
  const controller = createApplyProcessingEventController({
    ...externals,
    handlerOptions: { retry },
  });
  await amqp.consume(PROCESSING_STATUS_QUEUE, controller.handle, {
    retry,
    waitQueue: PROCESSING_STATUS_RETRY_QUEUE,
  });

  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    amqpUri: rabbit.amqpUri,
    prisma,
    s3,
    tokenFor: (sub) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: 'test-1' })
        .setSubject(sub)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey),
    stop: async () => {
      await app.close();
      await amqp.close();
      redis.disconnect();
      await prisma.$disconnect();
      await Promise.all([postgres.stop(), rabbit.stop(), storage.stop(), redisHandle.stop()]);
    },
  };
};
