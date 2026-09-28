import {
  defineMessageHandler,
  type ConsumeHandler,
  type MessageHandlerOptions,
} from '@zipframes/communication';
import { userDeletedEventSchema, type UserDeletedEvent } from '@zipframes/schemas/auth-service';

import type { DeleteContactUseCase } from '../application/useCases/deleteContact/DeleteContactUseCase.js';

export type UserDeletedHandlerOptions = MessageHandlerOptions<UserDeletedEvent, void>;

export class UserDeletedController {
  readonly handle: ConsumeHandler;

  constructor(deleteContact: DeleteContactUseCase, options: UserDeletedHandlerOptions) {
    this.handle = defineMessageHandler({
      ...options,
      schema: userDeletedEventSchema,
      handle: (event) => deleteContact.execute(event.payload.userId),
    });
  }
}
