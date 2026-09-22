import { createPublisher } from '@zipframes/communication';
import { createLogger } from '@zipframes/logger';

import { makeLogin } from '../application/use-cases/login.js';
import { makeRegisterUser } from '../application/use-cases/register-user.js';
import { BcryptPasswordHasher } from '../adapters/crypto/bcrypt-password-hasher.js';
import { deriveRsaKeyMaterial } from '../adapters/crypto/rsa-keys.js';
import { Rs256TokenIssuer } from '../adapters/crypto/rs256-token-issuer.js';
import { registerIdentityRoutes } from '../adapters/http/identity-routes.js';
import { createAmqpPublishPort } from '../adapters/messaging/amqp-publisher.js';
import { createOutboxRelay } from '../adapters/messaging/outbox-relay.js';
import { PrismaUserRepository } from '../adapters/persistence/prisma-user-repository.js';
import { connectAmqp } from '../frameworks/amqp-connection.js';
import { createHttpServer } from '../frameworks/http-server.js';
import { createPrismaClient } from '../frameworks/prisma-client.js';
import { loadConfig } from './config.js';

// Composition root: the one place allowed to know about every layer at
// once (docs/architecture/layers.md). Everything below is `new`ed here and
// injected; nothing above this file imports a concrete adapter.

const IDS = {
  next: (): string => crypto.randomUUID(),
};
const CLOCK = {
  now: (): Date => new Date(),
};

const main = async (): Promise<void> => {
  const config = loadConfig();
  const logger = createLogger({ service: 'auth-service', version: '0.1.0' });

  const prisma = createPrismaClient();
  const keys = await deriveRsaKeyMaterial(config.jwtPrivateKeyPem, config.jwtKid);
  const amqp = await connectAmqp(config.amqpUrl);
  const publisher = createPublisher(createAmqpPublishPort(amqp.channel));

  const users = new PrismaUserRepository(prisma);
  const hasher = new BcryptPasswordHasher();
  const tokens = new Rs256TokenIssuer({
    keys,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });

  const registerUser = makeRegisterUser({ users, hasher, ids: IDS, clock: CLOCK });
  const login = makeLogin({ users, hasher, tokens });

  const relay = createOutboxRelay({
    prisma,
    publisher,
    onPublishError: (row, error) => {
      logger.error('failed to publish outbox row', { outboxId: row.id, eventType: row.eventType, err: error });
    },
  });
  const relayTimer = setInterval(() => {
    relay.runOnce().catch((error: unknown) => {
      logger.error('outbox relay run failed', { err: error });
    });
  }, config.outboxIntervalMs);

  const app = createHttpServer({ corsOrigin: config.corsOrigin });
  registerIdentityRoutes(app, { registerUser, login, logger, jwks: [keys.publicJwk] });

  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info('auth-service listening', { port: config.port });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('shutting down', { signal });
    clearInterval(relayTimer);
    await app.close();
    await amqp.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- the logger itself may not exist
  // yet if startup failed before createLogger ran.
  console.error(error);
  process.exit(1);
});
