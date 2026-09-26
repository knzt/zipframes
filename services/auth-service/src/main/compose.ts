import { createPublisher } from '@zipframes/communication';
import { createReadinessCheck } from '@zipframes/core';
import { createLogger } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';

import { createAmqpEventPublisher } from '../infrastructure/gateways/amqpEventPublisher.gateway.js';
import { loadConfig } from '../infrastructure/loadEnvConfig.js';
import { connectAmqp, createAmqpPing } from '../infrastructure/messaging/amqpConnection.js';
import { createAmqpPublishPort } from '../infrastructure/messaging/amqpPublisher.js';
import { assertTopology } from '../infrastructure/messaging/topology.js';
import {
  createPrismaClient,
  createPrismaPing,
} from '../infrastructure/repositories/prisma/client.js';
import { PrismaUserRepository } from '../infrastructure/repositories/prisma/user.repository.js';
import { BcryptPasswordHasher } from '../infrastructure/services/crypto/bcryptPasswordHasher.js';
import { deriveRsaKeyMaterial } from '../infrastructure/services/crypto/rsaKeys.js';
import { Rs256TokenIssuer } from '../infrastructure/services/crypto/rs256TokenIssuer.js';
import { SystemClock } from '../infrastructure/services/systemClock.js';
import { UuidIdGenerator } from '../infrastructure/services/uuidIdGenerator.js';
import { buildIdentityApp } from './identityApp.js';

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

  const closers: (() => Promise<void>)[] = [];

  try {
    const prisma = createPrismaClient(config.databaseUrl);
    closers.push(() => prisma.$disconnect());

    const keys = await deriveRsaKeyMaterial(config.jwtPrivateKeyPem, config.jwtKid);

    const amqp = await connectAmqp(config.amqpUrl);
    closers.push(() => amqp.close());
    await assertTopology(amqp.channel);

    const clock = new SystemClock();
    const idGenerator = new UuidIdGenerator();
    const publisher = createPublisher(createAmqpPublishPort(amqp.channel));
    const eventPublisher = createAmqpEventPublisher({
      publisher,
      createId: () => idGenerator.next(),
      now: () => clock.now(),
    });

    const app = await buildIdentityApp({
      userRepository: new PrismaUserRepository(prisma),
      passwordHasher: new BcryptPasswordHasher(),
      tokenIssuer: new Rs256TokenIssuer({
        keys,
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
      }),
      eventPublisher,
      clock,
      idGenerator,
      jwks: [keys.publicJwk],
      isReady: createReadinessCheck([createPrismaPing(prisma), createAmqpPing(amqp)]),
      renderMetrics: () => technicalMetrics.registry.metrics(),
      logger,
      corsOrigin: config.corsOrigin,
      onPublishFailed: (error, details) => {
        logger.error('failed to publish user.registered', {
          err: error,
          userId: details.userId,
          correlationId: details.correlationId,
        });
      },
    });
    closers.push(() => app.close());

    await app.listen({ port: config.port, host: '0.0.0.0' });

    logger.info('auth-service listening', { port: config.port });

    return {
      stop: async () => {
        await app.close();
        await amqp.close();
        await prisma.$disconnect();
        logger.info('auth-service stopped');
      },
    };
  } catch (error) {
    for (const close of [...closers].reverse()) {
      await close().catch(() => undefined);
    }
    throw error;
  }
};
