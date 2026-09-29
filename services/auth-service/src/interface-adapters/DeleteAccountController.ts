import type { Authenticator } from '@zipframes/authenticator';
import { defineAuthenticatedHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { z } from 'zod';

import type { DeleteAccountUseCase } from '../application/useCases/deleteAccount/DeleteAccountUseCase.js';

/** `DELETE /account`: deletes the caller's own account. */
export class DeleteAccountController {
  private readonly handler: (request: HttpRequest) => Promise<HttpReply>;

  constructor(
    private readonly deleteAccountUseCase: DeleteAccountUseCase,
    authenticator: Authenticator,
  ) {
    this.handler = defineAuthenticatedHandler({
      // No body: the account is the token subject, not a request field.
      inputSchema: z.undefined(),
      // 204: nothing to send back.
      outputSchema: z.undefined(),
      successStatus: 204,
      authenticator,
      handler: (_input, ctx) =>
        this.deleteAccountUseCase.execute({
          userId: ctx.claims.sub,
          correlationId: ctx.correlationId,
        }),
    });
  }

  handle(request: HttpRequest): Promise<HttpReply> {
    return this.handler(request);
  }
}
