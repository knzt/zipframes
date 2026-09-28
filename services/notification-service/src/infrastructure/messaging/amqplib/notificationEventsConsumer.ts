import type { ConsumeContext, ConsumeHandler } from '@zipframes/communication';

import type { UserDeletedController } from '../../../interface-adapters/UserDeletedController.js';
import type { UserRegisteredController } from '../../../interface-adapters/UserRegisteredController.js';
import type { UserUpdatedController } from '../../../interface-adapters/UserUpdatedController.js';
import type { VideoFailedController } from '../../../interface-adapters/VideoFailedController.js';
import type { VideoProcessedController } from '../../../interface-adapters/VideoProcessedController.js';

export interface NotificationEventControllers {
  readonly userRegistered: UserRegisteredController;
  readonly userUpdated: UserUpdatedController;
  readonly userDeleted: UserDeletedController;
  readonly videoProcessed: VideoProcessedController;
  readonly videoFailed: VideoFailedController;
}

const peekEventType = (envelope: unknown): string | undefined => {
  if (typeof envelope !== 'object' || envelope === null || !('eventType' in envelope)) {
    return undefined;
  }
  const eventType: unknown = envelope.eventType;
  return typeof eventType === 'string' ? eventType : undefined;
};

/**
 * One queue, five controllers. Peek `eventType` first so the matching
 * `defineMessageHandler` schema does not poison a sibling event.
 */
export class NotificationEventsConsumer {
  readonly handle: ConsumeHandler;

  constructor(private readonly controllers: NotificationEventControllers) {
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
        case 'video.processed':
          await this.controllers.videoProcessed.handle(message, context);
          return;
        case 'video.failed':
          await this.controllers.videoFailed.handle(message, context);
          return;
        default:
          await context.deadLetter();
      }
    };
  }
}
