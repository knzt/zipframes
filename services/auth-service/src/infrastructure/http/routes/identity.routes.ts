import type { FastifyInstance, FastifyReply } from 'fastify';
import type { JWK } from 'jose';

import { createCorrelationId, runWithCorrelationId } from '@zipframes/logger';
import { authService } from '@zipframes/schemas';

import type { LoginController } from '../../../application/controllers/LoginController.js';
import type { RegisterUserController } from '../../../application/controllers/RegisterUserController.js';
import type { HttpReply } from '../httpReply.js';
import { jsonSchemaOf } from '../openapi.js';

export interface IdentityRoutesDependencies {
  readonly registerUserController: RegisterUserController;
  readonly loginController: LoginController;
  readonly jwks: readonly JWK[];
}

const CORRELATION_HEADER = 'x-correlation-id';

const problemDetailsJsonSchema = {
  type: 'object',
  required: ['type', 'title', 'status'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    correlationId: { type: 'string' },
  },
};

const problemDetailsSchema = (description: string): Record<string, unknown> => ({
  description,
  content: {
    'application/problem+json': {
      schema: problemDetailsJsonSchema,
    },
  },
});

const correlationIdOf = (headerValue: string | string[] | undefined): string => {
  if (typeof headerValue === 'string' && headerValue.length > 0) {
    return headerValue;
  }
  return createCorrelationId();
};

const sendControllerResult = async (reply: FastifyReply, result: HttpReply): Promise<void> => {
  const outgoing = reply.code(result.status);
  if (result.contentType !== undefined) {
    void outgoing.header('content-type', result.contentType);
  }
  await outgoing.send(result.body);
};

/**
 * Binds the identity HTTP surface. Status and body come from the controllers.
 */
export const registerIdentityRoutes = (
  app: FastifyInstance,
  deps: IdentityRoutesDependencies,
): void => {
  app.post(
    '/register',
    {
      schema: {
        tags: ['Identidade'],
        summary: 'Cadastra um usuário',
        body: jsonSchemaOf(authService.registerRequestSchema),
        response: {
          201: jsonSchemaOf(authService.registerResponseSchema),
          400: problemDetailsSchema('Dados inválidos'),
          409: problemDetailsSchema('E-mail já cadastrado'),
        },
      },
    },
    async (request, reply) => {
      const correlationId = correlationIdOf(request.headers[CORRELATION_HEADER]);
      await runWithCorrelationId(correlationId, async () => {
        const result = await deps.registerUserController.handle({
          body: request.body,
          correlationId,
        });
        await sendControllerResult(reply, result);
      });
    },
  );

  app.post(
    '/login',
    {
      schema: {
        tags: ['Identidade'],
        summary: 'Autentica e devolve o token de acesso',
        body: jsonSchemaOf(authService.loginRequestSchema),
        response: {
          200: jsonSchemaOf(authService.loginResponseSchema),
          401: problemDetailsSchema('Credenciais inválidas'),
        },
      },
    },
    async (request, reply) => {
      const correlationId = correlationIdOf(request.headers[CORRELATION_HEADER]);
      await runWithCorrelationId(correlationId, async () => {
        const result = await deps.loginController.handle({
          body: request.body,
          correlationId,
        });
        await sendControllerResult(reply, result);
      });
    },
  );

  app.get(
    '/.well-known/jwks.json',
    {
      schema: {
        tags: ['Identidade'],
        summary: 'Chaves públicas para validar tokens',
        response: {
          200: jsonSchemaOf(authService.jwksResponseSchema),
        },
      },
    },
    async (_request, reply) => {
      const response = authService.jwksResponseSchema.parse({ keys: deps.jwks });
      await reply.code(200).send(response);
    },
  );
};
