import { NotificationEventsConsumer } from '../../../infrastructure/messaging/amqplib/notificationEventsConsumer.js';
import { createUserDeletedController } from '../controllers/userDeletedController.js';
import {
  createUserRegisteredController,
  type NotificationControllerExternalDeps,
} from '../controllers/userRegisteredController.js';
import { createUserUpdatedController } from '../controllers/userUpdatedController.js';
import { createVideoFailedController } from '../controllers/videoFailedController.js';
import { createVideoProcessedController } from '../controllers/videoProcessedController.js';

export const createNotificationEventsConsumer = (
  externalDeps: NotificationControllerExternalDeps,
): NotificationEventsConsumer =>
  new NotificationEventsConsumer({
    userRegistered: createUserRegisteredController(externalDeps),
    userUpdated: createUserUpdatedController(externalDeps),
    userDeleted: createUserDeletedController(externalDeps),
    videoProcessed: createVideoProcessedController(externalDeps),
    videoFailed: createVideoFailedController(externalDeps),
  });
