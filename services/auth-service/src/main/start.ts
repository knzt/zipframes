import { createReadinessCheck } from '@zipframes/core';
import { createLogger } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';

import { bindHttpRoutes } from '../infrastructure/http/bindHttpRoutes.js';
import { registerHealthRoutes } from '../infrastructure/http/routes/health.routes.js';
import { createHttpServer } from '../infrastructure/http/server.js';
import { loadConfig } from '../infrastructure/loadEnvConfig.js';
import { createAmqpPing } from '../infrastructure/messaging/amqpConnection.js';
import { assertTopology } from '../infrastructure/messaging/topology.js';
import { createPrismaPing } from '../infrastructure/repositories/prisma/client.js';
import { createLoginController } from './factories/controllers/login.js';
import { createRegisterUserController } from './factories/controllers/registerUser.js';
import { createAmqp } from './factories/externals/amqp.js';
import { createPrisma } from './factories/externals/prisma.js';
import { createTokenIssuer } from './factories/services/tokenIssuer.js';
import { identityRoutes } from './handlers/identityRoutes.js';

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
    const prisma = createPrisma(config.databaseUrl);
    closers.push(() => prisma.$disconnect());

    const { tokenIssuer, keys } = await createTokenIssuer({
      privateKeyPem: config.jwtPrivateKeyPem,
      kid: config.jwtKid,
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
    });

    const amqp = await createAmqp(config.amqpUrl);
    closers.push(() => amqp.close());
    await assertTopology(amqp.channel);

    const app = await createHttpServer({ corsOrigin: config.corsOrigin, logger });
    bindHttpRoutes(
      app,
      identityRoutes({
        registerUser: createRegisterUserController({ prisma, amqp, logger }),
        login: createLoginController({ prisma, tokenIssuer }),
        jwks: [keys.publicJwk],
      }),
    );
    registerHealthRoutes(app, {
      isReady: createReadinessCheck([createPrismaPing(prisma), createAmqpPing(amqp)]),
      renderMetrics: () => technicalMetrics.registry.metrics(),
      logger,
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
