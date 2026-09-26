import { defineHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { authService } from '@zipframes/schemas';

import type { RegisterUserController } from '../../../application/controllers/RegisterUserController.js';

/**
 * HTTP edge for register. Validates in/out and maps Result to HttpReply.
 * The Fastify route only forwards that reply.
 */
export const createRegisterUserHandler = (
  controller: RegisterUserController,
): ((request: HttpRequest) => Promise<HttpReply>) =>
  defineHandler({
    inputSchema: authService.registerRequestSchema,
    outputSchema: authService.registerResponseSchema,
    successStatus: 201,
    handler: (input, ctx) => controller.handle(input, ctx),
  });
