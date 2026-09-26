import { defineHandler } from '@zipframes/http';
import { authService } from '@zipframes/schemas';

import { jsonSchemaOf } from '../../infrastructure/http/openapi.js';
import { problemDetailsSchema } from '../../infrastructure/http/problemDetails.schema.js';
import type { HttpRouteDefinition } from '../../infrastructure/http/httpRoute.js';
import type { RegisterUserController } from '../../interface-adapters/RegisterUserController.js';

export const registerUserHandler = (controller: RegisterUserController): HttpRouteDefinition => ({
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
  handle: defineHandler({
    inputSchema: authService.registerRequestSchema,
    outputSchema: authService.registerResponseSchema,
    successStatus: 201,
    handler: (input, ctx) => controller.handle(input, ctx),
  }),
});
