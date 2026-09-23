import type { FastifyInstance } from 'fastify';
import type { JWK } from 'jose';

import { authService, parseSchema } from '@zipframes/schemas';
import { createCorrelationId, runWithCorrelationId } from '@zipframes/logger';
import type { Logger } from '@zipframes/logger';

import type { makeLogin } from '../../application/use-cases/login.js';
import type { makeRegisterUser } from '../../application/use-cases/register-user.js';
import { PROBLEM_CONTENT_TYPE, problemDetails } from './problem-details.js';

export interface IdentityRoutesDependencies {
  readonly registerUser: ReturnType<typeof makeRegisterUser>;
  readonly login: ReturnType<typeof makeLogin>;
  readonly logger: Logger;
  readonly jwks: readonly JWK[];
  readonly isReady: () => Promise<boolean>;
  readonly renderMetrics: () => Promise<string>;
}

const CORRELATION_HEADER = 'x-correlation-id';

const correlationIdOf = (headerValue: string | string[] | undefined): string => {
  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return headerValue;
  }
  return createCorrelationId();
};

/**
 * Registers the auth-service HTTP surface: register, login, JWKS, and the
 * probes the process needs in order to receive traffic.
 */
export const registerIdentityRoutes = (
  app: FastifyInstance,
  deps: IdentityRoutesDependencies,
): void => {
  app.post('/register', async (request, reply) => {
    const correlationId = correlationIdOf(request.headers[CORRELATION_HEADER]);

    return runWithCorrelationId(correlationId, async () => {
      const body = parseSchema(authService.registerRequestSchema, request.body);
      if (!body.ok) {
        await reply
          .code(400)
          .header('content-type', PROBLEM_CONTENT_TYPE)
          .send(problemDetails(400, 'Invalid request body', body.error.message, correlationId));
        return;
      }

      const result = await deps.registerUser({ ...body.value, correlationId });

      if (!result.ok) {
        const status = result.error.code === 'EMAIL_TAKEN' ? 409 : 400;
        const title =
          result.error.code === 'EMAIL_TAKEN' ? 'Email already registered' : 'Invalid request body';
        await reply
          .code(status)
          .header('content-type', PROBLEM_CONTENT_TYPE)
          .send(problemDetails(status, title, result.error.message, correlationId));
        return;
      }

      const response = authService.registerResponseSchema.parse(result.value);
      await reply.code(201).send(response);
    });
  });

  app.post('/login', async (request, reply) => {
    const correlationId = correlationIdOf(request.headers[CORRELATION_HEADER]);

    return runWithCorrelationId(correlationId, async () => {
      const body = parseSchema(authService.loginRequestSchema, request.body);
      if (!body.ok) {
        // Same problem, same status as a wrong password: a malformed body
        // is not a hint about which emails exist any more than a wrong
        // password is.
        await reply
          .code(401)
          .header('content-type', PROBLEM_CONTENT_TYPE)
          .send(problemDetails(401, 'Invalid credentials', undefined, correlationId));
        return;
      }

      const result = await deps.login(body.value);

      if (!result.ok) {
        await reply
          .code(401)
          .header('content-type', PROBLEM_CONTENT_TYPE)
          .send(problemDetails(401, 'Invalid credentials', undefined, correlationId));
        return;
      }

      const response = authService.loginResponseSchema.parse(result.value);
      await reply.code(200).send(response);
    });
  });

  app.get('/.well-known/jwks.json', async (_request, reply) => {
    const response = authService.jwksResponseSchema.parse({ keys: deps.jwks });
    await reply.code(200).send(response);
  });

  app.get('/health/live', async (_request, reply) => {
    await reply.code(200).send();
  });

  app.get('/health/ready', async (_request, reply) => {
    try {
      const ready = await deps.isReady();
      await reply.code(ready ? 200 : 503).send();
    } catch {
      await reply.code(503).send();
    }
  });

  app.get('/metrics', async (_request, reply) => {
    const body = await deps.renderMetrics();
    await reply.code(200).header('content-type', 'text/plain; version=0.0.4').send(body);
  });
};
