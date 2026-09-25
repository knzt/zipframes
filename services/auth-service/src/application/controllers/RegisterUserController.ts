import { type PROBLEM_CONTENT_TYPE, problemResponse, type ProblemDetails } from '@zipframes/core';
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
      return problemResponse(400, body.error.message, undefined, request.correlationId);
    }

    const result = await this.registerUserUseCase.execute({
      ...body.value,
      correlationId: request.correlationId,
    });
    if (!result.ok) {
      return problemResponse(
        result.error.statusCode,
        result.error.message,
        undefined,
        request.correlationId,
      ) as RegisterUserControllerResponse;
    }

    return {
      status: 201,
      body: authService.registerResponseSchema.parse(result.value),
    };
  }
}
