import { execFile } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

import { startPostgres } from '@zipframes/test-toolkit';
import type { PostgresHandle } from '@zipframes/test-toolkit';
import { exportPKCS8, generateKeyPair } from 'jose';
import type { JWK } from 'jose';
import type { PrismaClient } from '@prisma/client';

import type { EventPublisher } from '../../src/application/interfaces/gateways/EventPublisher.js';
import { createPrismaClient } from '../../src/infrastructure/repositories/prisma/client.js';
import { PrismaUserRepository } from '../../src/infrastructure/repositories/prisma/user.repository.js';
import { BcryptPasswordHasher } from '../../src/infrastructure/services/crypto/bcryptPasswordHasher.js';
import { deriveRsaKeyMaterial } from '../../src/infrastructure/services/crypto/rsaKeys.js';
import { Rs256TokenIssuer } from '../../src/infrastructure/services/crypto/rs256TokenIssuer.js';
import { SystemClock } from '../../src/infrastructure/services/systemClock.js';
import { UuidIdGenerator } from '../../src/infrastructure/services/uuidIdGenerator.js';
import { buildIdentityApp } from '../../src/main/identityApp.js';
import { silentLogger } from './silent-logger.js';

const execFileAsync = promisify(execFile);

const ISSUER = 'https://auth.zipframes.test';
const AUDIENCE = 'zipframes';

export interface IdentityApp {
  readonly baseUrl: string;
  readonly prisma: PrismaClient;
  readonly publicJwk: JWK;
  readonly stop: () => Promise<void>;
}

export interface IdentityAppOptions {
  readonly eventPublisher?: EventPublisher;
  readonly onPublishFailed?: (
    error: unknown,
    details: { readonly userId: string; readonly correlationId: string },
  ) => void;
}

export const startIdentityApp = async (options?: IdentityAppOptions): Promise<IdentityApp> => {
  const postgres: PostgresHandle = await startPostgres();
  const serviceRoot = path.resolve(import.meta.dirname, '../../');
  await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: serviceRoot,
    env: { ...process.env, AUTH_DATABASE_URL: postgres.connectionUri },
  });

  const prisma = createPrismaClient(postgres.connectionUri);
  const { privateKey } = await generateKeyPair('RS256');
  const keys = await deriveRsaKeyMaterial(await exportPKCS8(privateKey), 'key-1');
  const eventPublisher: EventPublisher = options?.eventPublisher ?? {
    publish: () => Promise.resolve(),
  };
  const logger = silentLogger();
  const onPublishFailed =
    options?.onPublishFailed ??
    ((error, details) => {
      logger.error('failed to publish user.registered', {
        err: error,
        userId: details.userId,
        correlationId: details.correlationId,
      });
    });

  const app = await buildIdentityApp({
    userRepository: new PrismaUserRepository(prisma),
    passwordHasher: new BcryptPasswordHasher(),
    tokenIssuer: new Rs256TokenIssuer({ keys, issuer: ISSUER, audience: AUDIENCE }),
    eventPublisher,
    clock: new SystemClock(),
    idGenerator: new UuidIdGenerator(),
    jwks: [keys.publicJwk],
    isReady: () => Promise.resolve({ ready: true }),
    renderMetrics: () => Promise.resolve(''),
    logger,
    corsOrigin: '*',
    onPublishFailed,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
    prisma,
    publicJwk: keys.publicJwk,
    stop: async () => {
      await app.close();
      await prisma.$disconnect();
      await postgres.stop();
    },
  };
};
