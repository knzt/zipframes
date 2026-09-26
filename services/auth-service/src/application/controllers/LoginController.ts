import { problemResponse } from '@zipframes/core';
import { defineHandler, type ErrorHelper, type HttpReply, type HttpRequest } from '@zipframes/http';
import { authService } from '@zipframes/schemas';

import { invalidCredentials } from '../useCases/login/LoginUseCase.js';
import type { LoginUseCase } from '../useCases/login/LoginUseCase.js';

export type LoginControllerRequest = HttpRequest;
export type LoginControllerResponse = HttpReply;

/**
 * A malformed body and a failed login share this reply, so the response does
 * not reveal which emails exist.
 */
const hideLoginFailure: ErrorHelper = (_error, ctx) =>
  problemResponse(
    invalidCredentials.statusCode,
    invalidCredentials.message,
    undefined,
    ctx.correlationId,
  );

/**
 * Login HTTP adapter. `defineHandler` validates in/out; `errorHelper` keeps
 * every failure as the same 401. The Fastify route only forwards this result.
 */
export class LoginController {
  readonly handle: (request: HttpRequest) => Promise<HttpReply>;

  constructor(loginUseCase: LoginUseCase) {
    this.handle = defineHandler({
      inputSchema: authService.loginRequestSchema,
      outputSchema: authService.loginResponseSchema,
      successStatus: 200,
      errorHelper: hideLoginFailure,
      handler: (input) => loginUseCase.execute(input),
    });
  }
}
