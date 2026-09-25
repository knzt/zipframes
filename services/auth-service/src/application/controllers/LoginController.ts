import { type PROBLEM_CONTENT_TYPE, problemResponse, type ProblemDetails } from '@zipframes/core';
import { authService, parseSchema } from '@zipframes/schemas';
import type { z } from 'zod';

import type { LoginUseCase } from '../useCases/login/LoginUseCase.js';

export interface LoginControllerRequest {
  readonly body: unknown;
  readonly correlationId: string;
}

export type LoginControllerResponse =
  | {
      readonly status: 200;
      readonly body: z.infer<typeof authService.loginResponseSchema>;
    }
  | {
      readonly status: 401;
      readonly contentType: typeof PROBLEM_CONTENT_TYPE;
      readonly body: ProblemDetails;
    };

/**
 * Turns an already decoded login request into a status and a body.
 * A malformed body and a failed login share the same 401, so the response
 * does not reveal which emails exist.
 */
export class LoginController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  async handle(request: LoginControllerRequest): Promise<LoginControllerResponse> {
    const body = parseSchema(authService.loginRequestSchema, request.body);
    if (!body.ok) {
      return problemResponse(401, 'Invalid credentials', undefined, request.correlationId);
    }

    const result = await this.loginUseCase.execute(body.value);
    if (!result.ok) {
      return problemResponse(401, 'Invalid credentials', undefined, request.correlationId);
    }

    return {
      status: 200,
      body: authService.loginResponseSchema.parse(result.value),
    };
  }
}
