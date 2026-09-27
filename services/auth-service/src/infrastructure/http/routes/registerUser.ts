import { authService } from '@zipframes/schemas';

import { jsonSchemaOf } from '../openapi.js';
import { problemDetailsSchema } from '../problemDetails.schema.js';
import type { HttpRouteDefinition } from '../httpRoute.js';
import type { RegisterUserController } from '../../../interface-adapters/RegisterUserController.js';

export const registerUserRoute = (controller: RegisterUserController): HttpRouteDefinition => ({
  method: 'POST',
  path: '/register',
  openApi: {
    tags: ['Identidade'],
    summary: 'Cadastra um usuário',
    body: jsonSchemaOf(authService.registerRequestSchema),
    response: {
      201: jsonSchemaOf(authService.registerResponseSchema),
      400: problemDetailsSchema('Dados inválidos'),
      409: problemDetailsSchema('E-mail já cadastrado'),
    },
  },
  handle: (request) => controller.handle(request),
});
