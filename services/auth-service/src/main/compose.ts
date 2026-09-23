import { randomUUID } from 'node:crypto';

import { createPublisher } from '@zipframes/communication';
import { createLogger } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';

import { makeLogin } from '../application/use-cases/login.js';
import { makeRegisterUser } from '../application/use-cases/register-user.js';
import { BcryptPasswordHasher } from '../infrastructure/crypto/bcrypt-password-hasher.js';
import { deriveRsaKeyMaterial } from '../infrastructure/crypto/rsa-keys.js';
import { Rs256TokenIssuer } from '../infrastructure/crypto/rs256-token-issuer.js';
import { registerIdentityRoutes } from '../infrastructure/http/identity-routes.js';
import { createHttpServer } from '../infrastructure/http/server.js';
import { loadConfig } from '../infrastructure/config.js';
import { createAmqpPublishPort } from '../infrastructure/messaging/amqp-publisher.js';
import { connectAmqp } from '../infrastructure/messaging/amqp-connection.js';
import { createOutboxRelay } from '../infrastructure/messaging/outbox-relay.js';
import { createOutboxMetrics } from '../infrastructure/observability/outbox-metrics.js';
import { createPrismaClient, pingDatabase } from '../infrastructure/repositories/prisma-client.js';
import { PrismaUserRepository } from '../infrastructure/repositories/prisma-user-repository.js';

export const startAuthService = async (): Promise<{ stop: () => Promise<void> }> => {
  const config = loadConfig();
  const logger = createLogger({
    service: 'auth-service',
    version: config.serviceVersion,
    level: config.logLevel,
  });
  const technicalMetrics = createMetrics({
    service: 'auth-service',
    version: config.serviceVersion,
  });
  const outboxMetrics = createOutboxMetrics(technicalMetrics.registry);

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

  const registerUser = makeRegisterUser({
    users,
    hasher,
    ids: { next: () => randomUUID() },
    clock: { now: () => new Date() },
  });
  const login = makeLogin({ users, hasher, tokens });

  const relay = createOutboxRelay({
    prisma,
    publisher,
    maxAttempts: config.outboxMaxAttempts,
    onPublishError: (row, error) => {
      logger.error('failed to publish outbox row', {
        outboxId: row.id,
        eventType: row.eventType,
        attempts: row.attempts,
        err: error,
      });
    },
    onExhausted: (row) => {
      logger.error('outbox publish exhausted', {
        outboxId: row.id,
        eventType: row.eventType,
        attempts: row.attempts + 1,
        correlationId: row.correlationId,
      });
      outboxMetrics.recordExhausted();
    },
  });

  const relayTimer = setInterval(() => {
    relay.runOnce().catch((error: unknown) => {
      logger.error('outbox relay run failed', { err: error });
    });
  }, config.outboxIntervalMs);

  const app = createHttpServer({ corsOrigin: config.corsOrigin });
  registerIdentityRoutes(app, {
    registerUser,
    login,
    logger,
    jwks: [keys.publicJwk],
    isReady: async () => {
      if (!amqp.isConnected()) {
        return false;
      }
      await pingDatabase(prisma);
      return true;
    },
    renderMetrics: () => technicalMetrics.registry.metrics(),
  });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (error) {
    clearInterval(relayTimer);
    await amqp.close();
    await prisma.$disconnect();
    throw error;
  }

  logger.info('auth-service listening', { port: config.port });

  return {
    stop: async () => {
      clearInterval(relayTimer);
      await app.close();
      await amqp.close();
      await prisma.$disconnect();
      logger.info('auth-service stopped');
    },
  };
};
