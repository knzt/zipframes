import type { FastifyInstance } from 'fastify';

import type { HttpReply, HttpRequest } from '@zipframes/http';
import { authService } from '@zipframes/schemas';

import { sendHttpReply, toHttpRequest } from '../fastifyAdapter.js';
import { jsonSchemaOf } from '../openapi.js';
import { problemDetailsSchema } from '../problemDetails.schema.js';

export interface IdentityRoutesDependencies {
  readonly registerUserHandler: (request: HttpRequest) => Promise<HttpReply>;
  readonly loginHandler: (request: HttpRequest) => Promise<HttpReply>;
  readonly jwksHandler: (request: HttpRequest) => Promise<HttpReply>;
}

/**
 * Binds the identity HTTP surface. Status and body come from the handlers.
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
      await sendHttpReply(reply, await deps.registerUserHandler(toHttpRequest(request)));
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
      await sendHttpReply(reply, await deps.loginHandler(toHttpRequest(request)));
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
    async (request, reply) => {
      await sendHttpReply(reply, await deps.jwksHandler(toHttpRequest(request)));
    },
  );
};
