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
import { bindHttpRoutes } from '../../src/infrastructure/http/fastify/bindHttpRoutes.js';
import { registerHealthRoutes } from '../../src/infrastructure/http/fastify/health.routes.js';
import { createHttpServer } from '../../src/infrastructure/http/fastify/server.js';
import { createLoginController } from '../../src/main/factories/controllers/login.js';
import { createRegisterUserController } from '../../src/main/factories/controllers/registerUser.js';
import { createPrisma } from '../../src/main/factories/externals/prisma.js';
import { createTokenIssuer } from '../../src/main/factories/services/tokenIssuer.js';
import { identityRoutes } from '../../src/main/handlers/identityRoutes.js';
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

  const prisma = createPrisma(postgres.connectionUri);
  const { privateKey } = await generateKeyPair('RS256');
  const { tokenIssuer, keys } = await createTokenIssuer({
    privateKeyPem: await exportPKCS8(privateKey),
    kid: 'key-1',
    issuer: ISSUER,
    audience: AUDIENCE,
  });
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

  const app = await createHttpServer({ corsOrigin: '*', logger });
  bindHttpRoutes(
    app,
    identityRoutes({
      registerUser: createRegisterUserController({
        prisma,
        logger,
        eventPublisher,
        onPublishFailed,
      }),
      login: createLoginController({ prisma, tokenIssuer }),
      jwks: [keys.publicJwk],
    }),
  );
  registerHealthRoutes(app, {
    isReady: () => Promise.resolve({ ready: true }),
    renderMetrics: () => Promise.resolve(''),
    logger,
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
