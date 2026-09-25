import { PROBLEM_CONTENT_TYPE, problemDetails } from '@zipframes/core';
import { authService, parseSchema } from '@zipframes/schemas';

import type { ControllerResponse } from '../http/controllerResponse.types.js';
import type { LoginUseCase } from '../useCases/login/LoginUseCase.js';
import type { LoginRequest } from './login.types.js';

/**
 * Turns an already decoded login request into a status and a body.
 * A malformed body and a failed login share the same 401, so the response
 * does not reveal which emails exist.
 */
export class LoginController {
  constructor(private readonly loginUseCase: LoginUseCase) {}

  async handle(request: LoginRequest): Promise<ControllerResponse> {
    const body = parseSchema(authService.loginRequestSchema, request.body);
    if (!body.ok) {
      return {
        status: 401,
        contentType: PROBLEM_CONTENT_TYPE,
        body: problemDetails(401, 'Invalid credentials', undefined, request.correlationId),
      };
    }

    const result = await this.loginUseCase.execute(body.value);
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
  }
}
