import type { FastifyInstance } from 'fastify';

import type { ReadinessResult } from '@zipframes/core';

export interface HealthRoutesDependencies {
  readonly isReady: () => Promise<ReadinessResult>;
  readonly renderMetrics: () => Promise<string>;
}

export const registerHealthRoutes = (
  app: FastifyInstance,
  deps: HealthRoutesDependencies,
): void => {
  app.get('/health/live', async (_request, reply) => {
    await reply.code(200).send({ status: 'ok' });
  });

  app.get('/health/ready', async (_request, reply) => {
    try {
      const result = await deps.isReady();
      if (result.ready) {
        await reply.code(200).send({ status: 'ready' });
        return;
      }
      await reply.code(503).send({ status: 'not_ready', reason: result.reason ?? 'unknown' });
    } catch (error) {
      await reply.code(503).send({
        status: 'not_ready',
        reason: error instanceof Error ? error.message : 'unknown',
      });
    }
  });

  app.get('/metrics', async (_request, reply) => {
    const body = await deps.renderMetrics();
    await reply.code(200).header('content-type', 'text/plain; version=0.0.4').send(body);
  });
};
