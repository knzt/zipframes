import type { ConsumeContext, ConsumeHandler } from '@zipframes/communication';

import type { UserDeletedController } from '../../../interface-adapters/contacts/UserDeletedController.js';
import type { UserRegisteredController } from '../../../interface-adapters/contacts/UserRegisteredController.js';
import type { UserUpdatedController } from '../../../interface-adapters/contacts/UserUpdatedController.js';
import { peekEventType } from './peekEventType.js';

export interface ContactEventControllers {
  readonly userRegistered: UserRegisteredController;
  readonly userUpdated: UserUpdatedController;
  readonly userDeleted: UserDeletedController;
}

/**
 * Identity queue only. Peek `eventType` first so the matching
 * `defineMessageHandler` schema does not poison a sibling event.
 */
export class ContactEventsConsumer {
  readonly handle: ConsumeHandler;

  constructor(private readonly controllers: ContactEventControllers) {
    this.handle = async (message, context: ConsumeContext): Promise<void> => {
      switch (peekEventType(message.envelope)) {
        case 'user.registered':
          await this.controllers.userRegistered.handle(message, context);
          return;
        case 'user.updated':
          await this.controllers.userUpdated.handle(message, context);
          return;
        case 'user.deleted':
          await this.controllers.userDeleted.handle(message, context);
          return;
        default:
          await context.deadLetter();
      }
    };
  }
}
