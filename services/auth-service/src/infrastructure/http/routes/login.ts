import { authService } from '@zipframes/schemas';

import { jsonSchemaOf } from '../openapi.js';
import { problemDetailsSchema } from '../problemDetails.schema.js';
import type { HttpRouteDefinition } from '../httpRoute.js';
import type { LoginController } from '../../../interface-adapters/LoginController.js';

export const loginRoute = (controller: LoginController): HttpRouteDefinition => ({
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
  handle: (request) => controller.handle(request),
});
