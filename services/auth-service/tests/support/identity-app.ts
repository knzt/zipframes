import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';

import { PrismaClient } from '@prisma/client';
import { startPostgres } from '@zipframes/test-toolkit';
import type { PostgresHandle } from '@zipframes/test-toolkit';
import { exportPKCS8, generateKeyPair } from 'jose';
import type { JWK } from 'jose';

import { LoginController } from '../../src/application/controllers/LoginController.js';
import { RegisterUserController } from '../../src/application/controllers/RegisterUserController.js';
import { LoginUseCase } from '../../src/application/useCases/login/LoginUseCase.js';
import { RegisterUserUseCase } from '../../src/application/useCases/registerUser/RegisterUserUseCase.js';
import { PrismaEventOutbox } from '../../src/infrastructure/gateways/prismaEventOutbox.gateway.js';
import { createHttpServer } from '../../src/infrastructure/http/server.js';
import { registerIdentityRoutes } from '../../src/infrastructure/http/routes/identity.routes.js';
import { PrismaUnitOfWork } from '../../src/infrastructure/repositories/prisma/prismaUnitOfWork.js';
import { PrismaUserRepository } from '../../src/infrastructure/repositories/prisma/user.repository.js';
import { BcryptPasswordHasher } from '../../src/infrastructure/services/crypto/bcryptPasswordHasher.js';
import { deriveRsaKeyMaterial } from '../../src/infrastructure/services/crypto/rsaKeys.js';
import { Rs256TokenIssuer } from '../../src/infrastructure/services/crypto/rs256TokenIssuer.js';
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

export const startIdentityApp = async (): Promise<IdentityApp> => {
  const postgres: PostgresHandle = await startPostgres();
  const serviceRoot = path.resolve(import.meta.dirname, '../../');
  await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: serviceRoot,
    env: { ...process.env, AUTH_DATABASE_URL: postgres.connectionUri },
  });

  const prisma = new PrismaClient({ datasources: { db: { url: postgres.connectionUri } } });
  const { privateKey } = await generateKeyPair('RS256');
  const keys = await deriveRsaKeyMaterial(await exportPKCS8(privateKey), 'key-1');
  const ids = { next: () => randomUUID() };
  const clock = { now: () => new Date() };
  const users = new PrismaUserRepository(prisma);
  const eventOutbox = new PrismaEventOutbox(prisma, ids, clock);
  const hasher = new BcryptPasswordHasher();
  const registerUserController = new RegisterUserController(
    new RegisterUserUseCase(users, eventOutbox, new PrismaUnitOfWork(prisma), hasher, ids, clock),
  );
  const loginController = new LoginController(
    new LoginUseCase(
      users,
      hasher,
      new Rs256TokenIssuer({ keys, issuer: ISSUER, audience: AUDIENCE }),
    ),
  );

  const app = await createHttpServer({ corsOrigin: '*', logger: silentLogger() });
  registerIdentityRoutes(app, {
    registerUserController,
    loginController,
    jwks: [keys.publicJwk],
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
