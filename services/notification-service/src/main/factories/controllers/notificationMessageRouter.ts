import { NotificationMessageRouter } from '../../../interface-adapters/NotificationMessageRouter.js';
import { createUserDeletedController } from './userDeletedController.js';
import { createUserRegisteredController } from './userRegisteredController.js';
import type { NotificationControllerExternalDeps } from './userRegisteredController.js';
import { createUserUpdatedController } from './userUpdatedController.js';
import { createVideoFailedController } from './videoFailedController.js';
import { createVideoProcessedController } from './videoProcessedController.js';

export const createNotificationMessageRouter = (
  externalDeps: NotificationControllerExternalDeps,
): NotificationMessageRouter =>
  new NotificationMessageRouter({
    userRegistered: createUserRegisteredController(externalDeps),
    userUpdated: createUserUpdatedController(externalDeps),
    userDeleted: createUserDeletedController(externalDeps),
    videoProcessed: createVideoProcessedController(externalDeps),
    videoFailed: createVideoFailedController(externalDeps),
  });
