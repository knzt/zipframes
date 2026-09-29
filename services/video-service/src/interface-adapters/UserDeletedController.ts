import {
  defineMessageHandler,
  type ConsumeHandler,
  type MessageHandlerOptions,
} from '@zipframes/communication';
import { userDeletedEventSchema, type UserDeletedEvent } from '@zipframes/schemas/auth-service';

import type { DeleteAccountVideosUseCase } from '../application/useCases/deleteAccountVideos/DeleteAccountVideosUseCase.js';

export type UserDeletedHandlerOptions = MessageHandlerOptions<UserDeletedEvent, void>;

/**
 * Message boundary for `user.deleted`: `defineMessageHandler` validates the
 * envelope and settles the message; this controller only unwraps the id.
 */
export class UserDeletedController {
  readonly handle: ConsumeHandler;

  constructor(
    private readonly deleteAccountVideosUseCase: DeleteAccountVideosUseCase,
    options: UserDeletedHandlerOptions,
  ) {
    this.handle = defineMessageHandler({
      ...options,
      schema: userDeletedEventSchema,
      handle: (event) => this.deleteAccountVideosUseCase.execute(event.payload.userId),
    });
  }
}
