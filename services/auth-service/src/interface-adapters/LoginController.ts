import { problemResponse } from '@zipframes/core';
import { defineHandler, type ErrorHelper, type HttpReply, type HttpRequest } from '@zipframes/http';
import { authService } from '@zipframes/schemas';

import {
  invalidCredentials,
  type LoginUseCase,
} from '../application/useCases/login/LoginUseCase.js';

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
 * Validates the login request, calls the use case and turns its `Result`
 * into an HTTP reply. Any failure answers 401 (anti-enumeration).
 */
export class LoginController {
  private readonly handler: (request: HttpRequest) => Promise<HttpReply>;

  constructor(private readonly loginUseCase: LoginUseCase) {
    this.handler = defineHandler({
      inputSchema: authService.loginRequestSchema,
      outputSchema: authService.loginResponseSchema,
      successStatus: 200,
      errorHelper: hideLoginFailure,
      handler: (credentials) => this.loginUseCase.execute(credentials),
    });
  }

  handle(request: HttpRequest): Promise<HttpReply> {
    return this.handler(request);
  }
}
