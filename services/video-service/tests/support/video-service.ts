import { exec } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { startPostgres, startRabbitMq, startRedis, startS3 } from '@zipframes/test-toolkit';
import type {
  PostgresHandle,
  RabbitMqHandle,
  RedisHandle,
  S3Handle,
} from '@zipframes/test-toolkit';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { startVideoService, type RunningVideoService } from '../../src/main/start.js';

const execAsync = promisify(exec);

export const BUCKET = 'videos';
export const MAX_UPLOAD_BYTES = 1024 * 1024;
const ISSUER = 'https://auth.zipframes.test';
const AUDIENCE = 'zipframes';
const KEY_ID = 'test-1';

/** Applies the Prisma migrations the way the deploy does. */
export const migrate = async (databaseUrl: string): Promise<void> => {
  await execAsync('pnpm exec prisma migrate deploy', {
    cwd: path.resolve(import.meta.dirname, '../../'),
    env: { ...process.env, VIDEO_DATABASE_URL: databaseUrl },
  });
};

/**
 * Stands in for the auth-service: publishes a public key at a real JWKS URL
 * and signs access tokens with the private one.
 */
const startIssuer = async (): Promise<{
  readonly jwksUrl: string;
  readonly tokenFor: (sub: string) => Promise<string>;
  readonly stop: () => Promise<void>;
}> => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwks = JSON.stringify({
    keys: [{ ...(await exportJWK(publicKey)), kid: KEY_ID, alg: 'RS256', use: 'sig' }],
  });
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' }).end(jwks);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    jwksUrl: `http://127.0.0.1:${String(port)}/.well-known/jwks.json`,
    tokenFor: (sub) =>
      new SignJWT({})
        .setProtectedHeader({ alg: 'RS256', kid: KEY_ID })
        .setSubject(sub)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey),
    stop: () =>
      new Promise((resolve) => {
        server.close(() => {
          resolve();
        });
      }),
  };
};

/** Environment variables the service reads, beyond the ones pointing at the containers. */
export type ServiceSettings = Readonly<Record<string, string>>;

export interface VideoServiceUnderTest {
  /** Base URL of the running service. */
  readonly url: string;
  readonly amqpUri: string;
  /** A client of the same storage the service writes to. */
  readonly s3: S3Client;
  readonly tokenFor: (sub: string) => Promise<string>;
  /** Stops the service and starts it again with other settings, keeping the data. */
  readonly restart: (settings: ServiceSettings) => Promise<void>;
  readonly stop: () => Promise<void>;
}

/**
 * The video-service as it runs in production: `startVideoService()` reads
 * its configuration from the environment, against real Postgres, RabbitMQ,
 * SeaweedFS and Redis, and validates tokens through a JWKS URL.
 */
export const startVideoServiceUnderTest = async (
  settings: ServiceSettings = {},
): Promise<VideoServiceUnderTest> => {
  const [postgres, rabbit, storage, redis]: [
    PostgresHandle,
    RabbitMqHandle,
    S3Handle,
    RedisHandle,
  ] = await Promise.all([startPostgres(), startRabbitMq(), startS3(), startRedis()]);
  await migrate(postgres.connectionUri);

  const s3 = new S3Client({
    endpoint: storage.endpoint,
    region: storage.region,
    forcePathStyle: true,
    credentials: { accessKeyId: storage.accessKey, secretAccessKey: storage.secretKey },
  });
  await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  const issuer = await startIssuer();

  const start = (overrides: ServiceSettings): Promise<RunningVideoService> => {
    Object.assign(process.env, {
      PORT: '0',
      VIDEO_DATABASE_URL: postgres.connectionUri,
      AMQP_URL: rabbit.amqpUri,
      REDIS_URL: redis.url,
      S3_ENDPOINT: storage.endpoint,
      S3_REGION: storage.region,
      S3_ACCESS_KEY: storage.accessKey,
      S3_SECRET_KEY: storage.secretKey,
      S3_BUCKET: BUCKET,
      JWT_JWKS_URL: issuer.jwksUrl,
      JWT_ISSUER: ISSUER,
      JWT_AUDIENCE: AUDIENCE,
      MAX_UPLOAD_BYTES: String(MAX_UPLOAD_BYTES),
      RETRY_BASE_DELAY_MS: '100',
      RETRY_MAX_DELAY_MS: '200',
      LOG_LEVEL: 'error',
      ...overrides,
    });
    return startVideoService();
  };

  let service = await start(settings);

  return {
    get url() {
      return service.url;
    },
    amqpUri: rabbit.amqpUri,
    s3,
    tokenFor: issuer.tokenFor,
    restart: async (overrides) => {
      await service.stop();
      service = await start(overrides);
    },
    stop: async () => {
      await service.stop();
      await issuer.stop();
      s3.destroy();
      await Promise.all([postgres.stop(), rabbit.stop(), storage.stop(), redis.stop()]);
    },
  };
};
