import { EmailEventsConsumer } from '../../../infrastructure/messaging/amqplib/emailEventsConsumer.js';
import { createVideoFailedController } from '../controllers/emails/videoFailedController.js';
import { createVideoProcessedController } from '../controllers/emails/videoProcessedController.js';
import type { NotificationControllerExternalDeps } from '../controllers/externalDeps.js';

export const createEmailEventsConsumer = (
  externalDeps: NotificationControllerExternalDeps,
): EmailEventsConsumer =>
  new EmailEventsConsumer({
    videoProcessed: createVideoProcessedController(externalDeps),
    videoFailed: createVideoFailedController(externalDeps),
  });
