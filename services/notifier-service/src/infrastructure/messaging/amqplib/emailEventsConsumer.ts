import type { ConsumeContext, ConsumeHandler } from '@zipframes/communication';

import type { VideoFailedController } from '../../../interface-adapters/emails/VideoFailedController.js';
import type { VideoProcessedController } from '../../../interface-adapters/emails/VideoProcessedController.js';
import { peekEventType } from './peekEventType.js';

export interface EmailEventControllers {
  readonly videoProcessed: VideoProcessedController;
  readonly videoFailed: VideoFailedController;
}

/**
 * Client e-mail queue only. Peek `eventType` first so the matching
 * `defineMessageHandler` schema does not poison a sibling event.
 */
export class EmailEventsConsumer {
  readonly handle: ConsumeHandler;

  constructor(private readonly controllers: EmailEventControllers) {
    this.handle = async (message, context: ConsumeContext): Promise<void> => {
      switch (peekEventType(message.envelope)) {
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
