import { randomUUID } from 'node:crypto';

import { createPublisher } from '@zipframes/communication';
import { createReadinessCheck } from '@zipframes/core';
import type { Pingable } from '@zipframes/core';
import { createLogger } from '@zipframes/logger';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';
import { createMetrics } from '@zipframes/telemetry';

import { LoginController } from '../application/controllers/LoginController.js';
import { RegisterUserController } from '../application/controllers/RegisterUserController.js';
import { LoginUseCase } from '../application/useCases/login/LoginUseCase.js';
import { RegisterUserUseCase } from '../application/useCases/registerUser/RegisterUserUseCase.js';
import { loadConfig } from '../infrastructure/loadEnvConfig.js';
import { createAmqpEventPublisher } from '../infrastructure/gateways/amqpEventPublisher.gateway.js';
import { createLoginHandler } from '../infrastructure/http/handlers/loginHandler.js';
import { createRegisterUserHandler } from '../infrastructure/http/handlers/registerUserHandler.js';
import { createHttpServer } from '../infrastructure/http/server.js';
import { registerHealthRoutes } from '../infrastructure/http/routes/health.routes.js';
import { registerIdentityRoutes } from '../infrastructure/http/routes/identity.routes.js';
import { connectAmqp } from '../infrastructure/messaging/amqpConnection.js';
import { createAmqpPublishPort } from '../infrastructure/messaging/amqpPublisher.js';
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

  const prisma = createPrismaClient();
  const keys = await deriveRsaKeyMaterial(config.jwtPrivateKeyPem, config.jwtKid);
  const amqp = await connectAmqp(config.amqpUrl);
  await amqp.channel.assertExchange(EVENT_EXCHANGE, 'topic', { durable: true });

  const createId = (): string => randomUUID();
  const now = (): Date => new Date();
  const publisher = createPublisher(createAmqpPublishPort(amqp.channel));
  const eventPublisher = createAmqpEventPublisher({ publisher, createId, now });

  const userRepository = new PrismaUserRepository(prisma);
  const passwordHasher = new BcryptPasswordHasher();
  const tokenIssuer = new Rs256TokenIssuer({
    keys,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
  });

  const registerUserController = new RegisterUserController(
    new RegisterUserUseCase(
      userRepository,
      passwordHasher,
      { next: createId },
      { now },
      eventPublisher,
      (error, details) => {
        logger.error('failed to publish user.registered', {
          err: error,
          userId: details.userId,
          correlationId: details.correlationId,
        });
      },
    ),
  );
  const loginController = new LoginController(
    new LoginUseCase(userRepository, passwordHasher, tokenIssuer),
  );

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

  const app = await createHttpServer({ corsOrigin: config.corsOrigin, logger });
  registerIdentityRoutes(app, {
    registerUserHandler: createRegisterUserHandler(registerUserController),
    loginHandler: createLoginHandler(loginController),
    jwks: [keys.publicJwk],
  });
  registerHealthRoutes(app, {
    isReady,
    renderMetrics: () => technicalMetrics.registry.metrics(),
    logger,
  });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (error) {
    await amqp.close();
    await prisma.$disconnect();
    throw error;
  }

  logger.info('auth-service listening', { port: config.port });

  return {
    stop: async () => {
      await app.close();
      await amqp.close();
      await prisma.$disconnect();
      logger.info('auth-service stopped');
    },
  };
};
