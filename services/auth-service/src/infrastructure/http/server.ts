import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import { registerOpenApi } from './openapi.js';

export interface HttpServerOptions {
  readonly corsOrigin: string;
}

export const createHttpServer = async (options: HttpServerOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    // Logging is ours (@zipframes/logger), not Fastify's own pino instance:
    // one format, one place redaction rules live.
    logger: false,
  });

  await app.register(cors, { origin: options.corsOrigin });
  await registerOpenApi(app, {
    title: 'ZipFrames auth-service',
    version: '0.1.0',
    description:
      'Cadastro, autenticação e emissão de tokens. A especificação é gerada das schemas das rotas.',
  });

  return app;
};
