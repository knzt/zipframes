import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import { registerOpenApi } from '../infrastructure/http/openapi.js';
import {
  registerHealthRoutes,
  type HealthRoutesDependencies,
} from '../infrastructure/http/routes/health.routes.js';

/** Fastify app for liveness, readiness, metrics and generated OpenAPI. Does not listen. */
export const createHealthApp = async (deps: HealthRoutesDependencies): Promise<FastifyInstance> => {
  const app = Fastify({ logger: false });
  await registerOpenApi(app, {
    title: 'ZipFrames processor-worker',
    version: '0.0.0',
    description: 'Saúde e métricas do worker. A especificação é gerada das schemas das rotas.',
  });
  registerHealthRoutes(app, deps);
  return app;
};
