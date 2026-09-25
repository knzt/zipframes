import type { FastifyInstance } from 'fastify';

import type { ReadinessResult } from '@zipframes/core';

export interface HealthRoutesDependencies {
  readonly isReady: () => Promise<ReadinessResult>;
  readonly renderMetrics: () => Promise<string>;
}

const liveResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { const: 'ok' },
  },
};

const readyResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { const: 'ready' },
  },
};

const notReadyResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'reason'],
  properties: {
    status: { const: 'not_ready' },
    reason: { type: 'string' },
  },
};

export const registerHealthRoutes = (
  app: FastifyInstance,
  deps: HealthRoutesDependencies,
): void => {
  app.get(
    '/health/live',
    {
      schema: {
        tags: ['Operação'],
        summary: 'Liveness',
        response: { 200: liveResponseSchema },
      },
    },
    async (_request, reply) => {
      await reply.code(200).send({ status: 'ok' });
    },
  );

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['Operação'],
        summary: 'Readiness',
        response: {
          200: readyResponseSchema,
          503: notReadyResponseSchema,
        },
      },
    },
    async (_request, reply) => {
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
    },
  );

  app.get(
    '/metrics',
    {
      schema: {
        tags: ['Operação'],
        summary: 'Métricas Prometheus',
        response: {
          200: { description: 'Texto Prometheus 0.0.4', type: 'string' },
        },
      },
    },
    async (_request, reply) => {
      const body = await deps.renderMetrics();
      await reply.code(200).header('content-type', 'text/plain; version=0.0.4').send(body);
    },
  );
};
