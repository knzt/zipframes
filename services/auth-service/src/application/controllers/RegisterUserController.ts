import { PROBLEM_CONTENT_TYPE, problemDetails } from '@zipframes/core';
import { authService, parseSchema } from '@zipframes/schemas';

import type { RegisterUserUseCase } from '../useCases/registerUser/RegisterUserUseCase.js';
import type { ControllerResponse } from './ControllerResponse.js';

export interface RegisterUserRequest {
  readonly body: unknown;
  readonly correlationId: string;
}

/**
 * Turns an already decoded register request into a status and a body.
 * The Fastify route only forwards this result.
 */
export class RegisterUserController {
  constructor(private readonly useCase: RegisterUserUseCase) {}

  async handle(request: RegisterUserRequest): Promise<ControllerResponse> {
    const body = parseSchema(authService.registerRequestSchema, request.body);
    if (!body.ok) {
      return {
        status: 400,
        contentType: PROBLEM_CONTENT_TYPE,
        body: problemDetails(
          400,
          'Invalid request body',
          body.error.message,
          request.correlationId,
        ),
      };
    }

    const result = await this.useCase.execute({
      ...body.value,
      correlationId: request.correlationId,
    });
    if (!result.ok) {
      const status = result.error.code === 'EMAIL_TAKEN' ? 409 : 400;
      const title =
        result.error.code === 'EMAIL_TAKEN' ? 'Email already registered' : 'Invalid request body';
      return {
        status,
        contentType: PROBLEM_CONTENT_TYPE,
        body: problemDetails(status, title, result.error.message, request.correlationId),
      };
    }

    return {
      status: 201,
      body: authService.registerResponseSchema.parse(result.value),
    };
  }
}
