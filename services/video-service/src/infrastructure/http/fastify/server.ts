import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { InternalServerError, isBaseError, problemResponse } from '@zipframes/core';
import { createCorrelationId, runWithCorrelationId } from '@zipframes/logger';
import type { Logger } from '@zipframes/logger';
import type { TechnicalMetrics } from '@zipframes/telemetry';

import { registerOpenApi } from './openapi.js';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

export interface HttpServerOptions {
  readonly corsOrigin: string;
  readonly logger: Logger;
  readonly version: string;
  readonly metrics?: TechnicalMetrics;
}

const CORRELATION_HEADER = 'x-correlation-id';
const UNMATCHED_ROUTE = 'unmatched';

const correlationIdOf = (request: FastifyRequest): string => {
  const headerValue = request.headers[CORRELATION_HEADER];
  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return headerValue;
  }
  return createCorrelationId();
};

const sendProblem = async (
  reply: FastifyReply,
  problem: ReturnType<typeof problemResponse>,
): Promise<void> => {
  await reply.code(problem.status).header('content-type', problem.contentType).send(problem.body);
};

const isClientError = (error: FastifyError): error is FastifyError & { statusCode: number } =>
  typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500;

const recordHttpMetrics = (app: FastifyInstance, metrics: TechnicalMetrics): void => {
  app.addHook('onResponse', (request, reply, done) => {
    // The route pattern, not the URL: one series per route, not per video id.
    const labels = {
      method: request.method,
      route: request.routeOptions.url ?? UNMATCHED_ROUTE,
      status: String(reply.statusCode),
    };
    metrics.httpRequestsTotal.inc(labels);
    metrics.httpRequestDurationSeconds.observe(labels, reply.elapsedTime / 1000);
    done();
  });
};

export const createHttpServer = async (options: HttpServerOptions): Promise<FastifyInstance> => {
  const app = Fastify({
    // Logging is ours (@zipframes/logger), not Fastify's own pino instance:
    // one format, one place redaction rules live.
    logger: false,
  });

  await app.register(cors, { origin: options.corsOrigin });
  await registerOpenApi(app, {
    title: 'ZipFrames video-service',
    version: options.version,
    description:
      'Upload, status e download dos vídeos de cada usuário. A especificação é gerada das schemas das rotas.',
  });

  app.decorateRequest('correlationId', '');
  app.addHook('onRequest', (request, _reply, done) => {
    const correlationId = correlationIdOf(request);
    request.correlationId = correlationId;
    runWithCorrelationId(correlationId, () => {
      done();
    });
  });

  if (options.metrics !== undefined) {
    recordHttpMetrics(app, options.metrics);
  }

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const correlationId = request.correlationId;

    if (isBaseError(error)) {
      if (error.statusCode >= 500) {
        options.logger.error('unhandled http error', { err: error, correlationId });
        return sendProblem(
          reply,
          problemResponse(error.statusCode, 'Internal server error', undefined, correlationId),
        );
      }
      return sendProblem(
        reply,
        problemResponse(error.statusCode, error.message, undefined, correlationId),
      );
    }

    if (isClientError(error)) {
      return sendProblem(
        reply,
        problemResponse(error.statusCode, 'Invalid request', undefined, correlationId),
      );
    }

    const httpError = new InternalServerError('UNEXPECTED', error.message, { cause: error });
    options.logger.error('unhandled http error', { err: httpError, correlationId });
    return sendProblem(
      reply,
      problemResponse(httpError.statusCode, 'Internal server error', undefined, correlationId),
    );
  });

  app.setNotFoundHandler((request, reply) =>
    sendProblem(reply, problemResponse(404, 'Not found', undefined, request.correlationId)),
  );

  return app;
};
