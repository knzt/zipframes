import type { FastifyInstance } from 'fastify';
import type { JWK } from 'jose';

import { PROBLEM_CONTENT_TYPE, problemDetails } from '@zipframes/core';
import { createCorrelationId, runWithCorrelationId } from '@zipframes/logger';
import type { Logger } from '@zipframes/logger';
import { authService, parseSchema } from '@zipframes/schemas';

import type { makeLogin } from '../../../application/useCases/login/login.useCase.js';
import type { makeRegisterUser } from '../../../application/useCases/registerUser/registerUser.useCase.js';

export interface IdentityRoutesDependencies {
  readonly registerUser: ReturnType<typeof makeRegisterUser>;
  readonly login: ReturnType<typeof makeLogin>;
  readonly logger: Logger;
  readonly jwks: readonly JWK[];
}

const CORRELATION_HEADER = 'x-correlation-id';

const correlationIdOf = (headerValue: string | string[] | undefined): string => {
  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return headerValue;
  }
  return createCorrelationId();
};

/**
 * Registers the auth-service identity HTTP surface: register, login, JWKS.
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
};
