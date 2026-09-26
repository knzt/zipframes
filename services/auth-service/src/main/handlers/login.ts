import { problemResponse } from '@zipframes/core';
import { defineHandler, type ErrorHelper } from '@zipframes/http';
import { authService } from '@zipframes/schemas';

import { invalidCredentials } from '../../application/useCases/login/LoginUseCase.js';
import { jsonSchemaOf } from '../../infrastructure/http/openapi.js';
import { problemDetailsSchema } from '../../infrastructure/http/problemDetails.schema.js';
import type { HttpRouteDefinition } from '../../infrastructure/http/httpRoute.js';
import type { LoginController } from '../../interface-adapters/LoginController.js';

/**
 * A malformed body and a failed login share this reply, so the response does
 * not reveal which emails exist.
 */
const hideLoginFailure: ErrorHelper = (_error, ctx) =>
  problemResponse(
    invalidCredentials.statusCode,
    invalidCredentials.message,
    undefined,
    ctx.correlationId,
  );

export const loginHandler = (controller: LoginController): HttpRouteDefinition => ({
  method: 'POST',
  path: '/login',
  openApi: {
    tags: ['Identidade'],
    summary: 'Autentica e devolve o token de acesso',
    body: jsonSchemaOf(authService.loginRequestSchema),
    response: {
      200: jsonSchemaOf(authService.loginResponseSchema),
      401: problemDetailsSchema('Credenciais inválidas'),
    },
  },
  handle: defineHandler({
    inputSchema: authService.loginRequestSchema,
    outputSchema: authService.loginResponseSchema,
    successStatus: 200,
    errorHelper: hideLoginFailure,
    handler: (input) => controller.handle(input),
  }),
});
