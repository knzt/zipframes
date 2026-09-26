import { problemResponse } from '@zipframes/core';
import { defineHandler, type ErrorHelper, type HttpReply, type HttpRequest } from '@zipframes/http';
import { authService } from '@zipframes/schemas';

import type { LoginController } from '../../../application/controllers/LoginController.js';
import { invalidCredentials } from '../../../application/useCases/login/LoginUseCase.js';

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
 * HTTP edge for login. Validates in/out; `errorHelper` keeps every failure as
 * the same 401. The Fastify route only forwards that reply.
 */
export const createLoginHandler = (
  controller: LoginController,
): ((request: HttpRequest) => Promise<HttpReply>) =>
  defineHandler({
    inputSchema: authService.loginRequestSchema,
    outputSchema: authService.loginResponseSchema,
    successStatus: 200,
    errorHelper: hideLoginFailure,
    handler: (input) => controller.handle(input),
  });
