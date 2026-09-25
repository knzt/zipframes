import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { problemResponse } from '@zipframes/core';
import { createCorrelationId } from '@zipframes/logger';
import type { Logger } from '@zipframes/logger';

import { registerOpenApi } from './openapi.js';

export interface HttpServerOptions {
  readonly corsOrigin: string;
  readonly logger: Logger;
}

const CORRELATION_HEADER = 'x-correlation-id';

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

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const correlationId = correlationIdOf(request);
    if (isClientError(error)) {
      return sendProblem(
        reply,
        problemResponse(error.statusCode, 'Invalid request', undefined, correlationId),
      );
    }

    options.logger.error('unhandled http error', { err: error, correlationId });
    return sendProblem(
      reply,
      problemResponse(500, 'Internal server error', undefined, correlationId),
    );
  });

  app.setNotFoundHandler((request, reply) => {
    const correlationId = correlationIdOf(request);
    return sendProblem(reply, problemResponse(404, 'Not found', undefined, correlationId));
  });

  return app;
};
