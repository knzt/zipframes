import {
  defineMessageHandler,
  type ConsumeHandler,
  type MessageHandlerOptions,
} from '@zipframes/communication';
import { userUpdatedEventSchema, type UserUpdatedEvent } from '@zipframes/schemas/auth-service';

import type { UpsertContactUseCase } from '../../application/useCases/upsertContact/UpsertContactUseCase.js';
import type { Contact } from '../../domain/entities/contact.js';

export type UserUpdatedHandlerOptions = MessageHandlerOptions<UserUpdatedEvent, Contact>;

export class UserUpdatedController {
  readonly handle: ConsumeHandler;

  constructor(upsertContact: UpsertContactUseCase, options: UserUpdatedHandlerOptions) {
    this.handle = defineMessageHandler({
      ...options,
      schema: userUpdatedEventSchema,
      handle: (event) =>
        upsertContact.execute({
          userId: event.payload.userId,
          name: event.payload.name,
          email: event.payload.email,
          occurredAt: new Date(event.occurredAt),
        }),
    });
  }
}
