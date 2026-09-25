import { randomUUID } from 'node:crypto';

import { createPublisher } from '@zipframes/communication';
import { createReadinessCheck } from '@zipframes/core';
import type { Pingable } from '@zipframes/core';
import { createLogger } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';

import { LoginController } from '../application/controllers/LoginController.js';
import { RegisterUserController } from '../application/controllers/RegisterUserController.js';
import { LoginUseCase } from '../application/useCases/login/LoginUseCase.js';
import { RegisterUserUseCase } from '../application/useCases/registerUser/RegisterUserUseCase.js';
import { loadConfig } from '../infrastructure/config.js';
import { createHttpServer } from '../infrastructure/http/server.js';
import { registerHealthRoutes } from '../infrastructure/http/routes/health.routes.js';
import { registerIdentityRoutes } from '../infrastructure/http/routes/identity.routes.js';
import { connectAmqp } from '../infrastructure/messaging/amqpConnection.js';
import { createAmqpPublishPort } from '../infrastructure/messaging/amqpPublisher.js';
import { createOutboxRelay } from '../infrastructure/messaging/outboxRelay.js';
import { createOutboxMetrics } from '../infrastructure/observability/outboxMetrics.js';
import { createPrismaClient, pingDatabase } from '../infrastructure/repositories/prisma/client.js';
import { PrismaUserRepository } from '../infrastructure/repositories/prisma/user.repository.js';
import { BcryptPasswordHasher } from '../infrastructure/services/crypto/bcryptPasswordHasher.js';
import { deriveRsaKeyMaterial } from '../infrastructure/services/crypto/rsaKeys.js';
import { Rs256TokenIssuer } from '../infrastructure/services/crypto/rs256TokenIssuer.js';

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

  const registerUserController = new RegisterUserController(
    new RegisterUserUseCase(users, hasher, { next: () => randomUUID() }, { now: () => new Date() }),
  );
  const loginController = new LoginController(new LoginUseCase(users, hasher, tokens));

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

  const prismaPing: Pingable = {
    ping: () => pingDatabase(prisma),
  };
  const amqpPing: Pingable = {
    ping: () => {
      if (!amqp.isConnected()) {
        return Promise.reject(new Error('amqp disconnected'));
      }
      return Promise.resolve();
    },
  };
  const isReady = createReadinessCheck([prismaPing, amqpPing]);

  const app = await createHttpServer({ corsOrigin: config.corsOrigin });
  registerIdentityRoutes(app, {
    registerUserController,
    loginController,
    jwks: [keys.publicJwk],
  });
  registerHealthRoutes(app, {
    isReady,
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
