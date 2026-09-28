import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { startPostgres, startRabbitMq } from '@zipframes/test-toolkit';
import type { PostgresHandle, RabbitMqHandle } from '@zipframes/test-toolkit';
import { exportPKCS8, generateKeyPair } from 'jose';

import { createPrisma, type Prisma } from '../../src/main/factories/externals/prisma.js';
import { startAuthService } from '../../src/main/start.js';

const execFileAsync = promisify(execFile);

export const ISSUER = 'https://auth.zipframes.test';
export const AUDIENCE = 'zipframes';

export interface AuthServiceUnderTest {
  /** Base URL of the running service. */
  readonly url: string;
  readonly amqpUri: string;
  /** A client of the same database, for assertions the API does not expose. */
  readonly prisma: Prisma;
  /** Takes the broker down under the running service. */
  readonly stopBroker: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

/**
 * The auth-service as it runs in production: `startAuthService()` reads its
 * configuration from the environment, against real Postgres and RabbitMQ.
 */
export const startAuthServiceUnderTest = async (): Promise<AuthServiceUnderTest> => {
  const [postgres, rabbit]: [PostgresHandle, RabbitMqHandle] = await Promise.all([
    startPostgres(),
    startRabbitMq(),
  ]);
  await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(import.meta.dirname, '../../'),
    env: { ...process.env, AUTH_DATABASE_URL: postgres.connectionUri },
    shell: process.platform === 'win32',
  });

  const { privateKey } = await generateKeyPair('RS256', { extractable: true });
  Object.assign(process.env, {
    PORT: '0',
    AUTH_DATABASE_URL: postgres.connectionUri,
    AMQP_URL: rabbit.amqpUri,
    JWT_PRIVATE_KEY_PEM: await exportPKCS8(privateKey),
    JWT_KID: 'key-1',
    JWT_ISSUER: ISSUER,
    JWT_AUDIENCE: AUDIENCE,
    LOG_LEVEL: 'error',
  });
  const service = await startAuthService();
  const prisma = createPrisma(postgres.connectionUri);

  let brokerStopped = false;
  const stopBroker = async (): Promise<void> => {
    if (!brokerStopped) {
      brokerStopped = true;
      await rabbit.stop();
    }
  };

  return {
    url: service.url,
    amqpUri: rabbit.amqpUri,
    prisma,
    stopBroker,
    stop: async () => {
      await service.stop();
      await prisma.$disconnect();
      await Promise.all([postgres.stop(), stopBroker()]);
    },
  };
};
