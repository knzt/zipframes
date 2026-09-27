import { defineHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { authService } from '@zipframes/schemas';

import type { RegisterUserUseCase } from '../application/useCases/registerUser/RegisterUserUseCase.js';

/**
 * Validates the register request, calls the use case with the correlation id
 * and turns its `Result` into an HTTP reply (201 or problem+json).
 */
export class RegisterUserController {
  private readonly handler: (request: HttpRequest) => Promise<HttpReply>;

  constructor(private readonly registerUserUseCase: RegisterUserUseCase) {
    this.handler = defineHandler({
      inputSchema: authService.registerRequestSchema,
      outputSchema: authService.registerResponseSchema,
      successStatus: 201,
      handler: (registration, ctx) =>
        this.registerUserUseCase.execute({ ...registration, correlationId: ctx.correlationId }),
    });
  }

  handle(request: HttpRequest): Promise<HttpReply> {
    return this.handler(request);
  }
}
