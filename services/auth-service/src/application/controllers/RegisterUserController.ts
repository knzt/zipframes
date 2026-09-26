import { defineHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { authService } from '@zipframes/schemas';

import type { RegisterUserUseCase } from '../useCases/registerUser/RegisterUserUseCase.js';

export type RegisterUserControllerRequest = HttpRequest;
export type RegisterUserControllerResponse = HttpReply;

/**
 * Register HTTP adapter. Validation, Result mapping and problem+json come from
 * `defineHandler`. The Fastify route only forwards this result.
 */
export class RegisterUserController {
  readonly handle: (request: HttpRequest) => Promise<HttpReply>;

  constructor(registerUserUseCase: RegisterUserUseCase) {
    this.handle = defineHandler({
      inputSchema: authService.registerRequestSchema,
      outputSchema: authService.registerResponseSchema,
      successStatus: 201,
      handler: (input, ctx) =>
        registerUserUseCase.execute({
          ...input,
          correlationId: ctx.correlationId,
        }),
    });
  }
}
