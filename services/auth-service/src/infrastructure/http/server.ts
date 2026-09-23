import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

export interface HttpServerOptions {
  readonly corsOrigin: string;
}

export const createHttpServer = (options: HttpServerOptions): FastifyInstance => {
  const app = Fastify({
    // Logging is ours (@zipframes/logger), not Fastify's own pino instance:
    // one format, one place redaction rules live.
    logger: false,
  });

  void app.register(cors, { origin: options.corsOrigin });

  return app;
};
