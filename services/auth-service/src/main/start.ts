import { createReadinessCheck } from '@zipframes/core';
import { createLogger } from '@zipframes/logger';
import { createMetrics } from '@zipframes/telemetry';

import { bindHttpRoutes } from '../infrastructure/http/fastify/bindHttpRoutes.js';
import { registerHealthRoutes } from '../infrastructure/http/fastify/health.routes.js';
import { createHttpServer } from '../infrastructure/http/fastify/server.js';
import { loadConfig } from '../infrastructure/loadEnvConfig.js';
import { assertAmqpTopology } from '../infrastructure/messaging/amqplib/amqpTopology.js';
import { createLoginController } from './factories/controllers/loginController.js';
import { createRegisterUserController } from './factories/controllers/registerUserController.js';
import { createAmqplib, createAmqpPing } from './factories/externals/amqplib.js';
import { createPrisma, createPrismaPing } from './factories/externals/prisma.js';
import { createTokenIssuer } from './factories/services/tokenIssuer.js';
import { identityRoutes } from '../infrastructure/http/routes/identityRoutes.js';

export interface RunningAuthService {
  /** Where the HTTP server listens; with `PORT=0` it carries the port the system picked. */
  readonly url: string;
  readonly stop: () => Promise<void>;
}

export const startAuthService = async (): Promise<RunningAuthService> => {
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

    const amqp = await createAmqplib(config.amqpUrl);
    closers.push(() => amqp.close());
    await assertAmqpTopology(amqp.channel);

    const app = await createHttpServer({
      corsOrigin: config.corsOrigin,
      logger,
      metrics: technicalMetrics,
    });
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

    const url = await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info('auth-service listening', { url });

    return {
      url,
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
