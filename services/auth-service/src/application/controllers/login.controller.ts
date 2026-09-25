import { PROBLEM_CONTENT_TYPE, problemDetails } from '@zipframes/core';
import { authService, parseSchema } from '@zipframes/schemas';

import type { makeLogin } from '../useCases/login/login.useCase.js';

export interface LoginControllerRequest {
  readonly body: unknown;
  readonly correlationId: string;
}

export interface LoginControllerResponse {
  readonly status: number;
  readonly body: unknown;
  readonly contentType?: string;
}

/**
 * Turns an already decoded login request into a status and a body.
 * A malformed body and a failed login share the same 401, so the response
 * does not reveal which emails exist.
 */
export const makeLoginController =
  (login: ReturnType<typeof makeLogin>) =>
  async (request: LoginControllerRequest): Promise<LoginControllerResponse> => {
    const body = parseSchema(authService.loginRequestSchema, request.body);
    if (!body.ok) {
      return {
        status: 401,
        contentType: PROBLEM_CONTENT_TYPE,
        body: problemDetails(401, 'Invalid credentials', undefined, request.correlationId),
      };
    }

    const result = await login(body.value);
    if (!result.ok) {
      return {
        status: 401,
        contentType: PROBLEM_CONTENT_TYPE,
        body: problemDetails(401, 'Invalid credentials', undefined, request.correlationId),
      };
    }

    return {
      status: 200,
      body: authService.loginResponseSchema.parse(result.value),
    };
  };
