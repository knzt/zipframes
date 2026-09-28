import {
  defineMessageHandler,
  type ConsumeHandler,
  type MessageHandlerOptions,
} from '@zipframes/communication';
import {
  userRegisteredEventSchema,
  type UserRegisteredEvent,
} from '@zipframes/schemas/auth-service';

import type { Contact } from '../domain/entities/contact.js';
import type { UpsertContactUseCase } from '../application/useCases/upsertContact/UpsertContactUseCase.js';

export type UserRegisteredHandlerOptions = MessageHandlerOptions<UserRegisteredEvent, Contact>;

export class UserRegisteredController {
  readonly handle: ConsumeHandler;

  constructor(upsertContact: UpsertContactUseCase, options: UserRegisteredHandlerOptions) {
    this.handle = defineMessageHandler({
      ...options,
      schema: userRegisteredEventSchema,
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
