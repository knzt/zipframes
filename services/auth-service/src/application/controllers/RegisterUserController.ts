import { PROBLEM_CONTENT_TYPE, problemDetails, type ProblemDetails } from '@zipframes/core';
import { authService, parseSchema } from '@zipframes/schemas';
import type { z } from 'zod';

import type { RegisterUserUseCase } from '../useCases/registerUser/RegisterUserUseCase.js';

export interface RegisterUserControllerRequest {
  readonly body: unknown;
  readonly correlationId: string;
}

export type RegisterUserControllerResponse =
  | {
      readonly status: 201;
      readonly body: z.infer<typeof authService.registerResponseSchema>;
    }
  | {
      readonly status: 400;
      readonly contentType: typeof PROBLEM_CONTENT_TYPE;
      readonly body: ProblemDetails;
    }
  | {
      readonly status: 409;
      readonly contentType: typeof PROBLEM_CONTENT_TYPE;
      readonly body: ProblemDetails;
    };

/**
 * Turns an already decoded register request into a status and a body.
 * The Fastify route only forwards this result.
 */
export class RegisterUserController {
  constructor(private readonly registerUserUseCase: RegisterUserUseCase) {}

  async handle(request: RegisterUserControllerRequest): Promise<RegisterUserControllerResponse> {
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

    const result = await this.registerUserUseCase.execute({
      ...body.value,
      correlationId: request.correlationId,
    });
    if (!result.ok) {
      if (result.error.code === 'EMAIL_TAKEN') {
        return {
          status: 409,
          contentType: PROBLEM_CONTENT_TYPE,
          body: problemDetails(
            409,
            'Email already registered',
            result.error.message,
            request.correlationId,
          ),
        };
      }
      return {
        status: 400,
        contentType: PROBLEM_CONTENT_TYPE,
        body: problemDetails(
          400,
          'Invalid request body',
          result.error.message,
          request.correlationId,
        ),
      };
    }

    return {
      status: 201,
      body: authService.registerResponseSchema.parse(result.value),
    };
  }
}
