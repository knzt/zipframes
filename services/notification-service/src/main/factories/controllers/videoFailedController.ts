import { VideoFailedController } from '../../../interface-adapters/VideoFailedController.js';
import { createNotifyVideoFailedUseCase } from '../use-cases/notifyVideoFailedUseCase.js';
import type { NotificationControllerExternalDeps } from './userRegisteredController.js';

export const createVideoFailedController = (
  externalDeps: NotificationControllerExternalDeps,
): VideoFailedController =>
  new VideoFailedController(
    createNotifyVideoFailedUseCase(externalDeps),
    externalDeps.handlerOptions,
  );
