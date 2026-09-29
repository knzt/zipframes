import { VideoFailedController } from '../../../../interface-adapters/emails/VideoFailedController.js';
import { createNotifyVideoFailedUseCase } from '../../use-cases/notifyVideoFailedUseCase.js';
import type { NotificationControllerExternalDeps } from '../externalDeps.js';

export const createVideoFailedController = (
  externalDeps: NotificationControllerExternalDeps,
): VideoFailedController =>
  new VideoFailedController(
    createNotifyVideoFailedUseCase(externalDeps),
    externalDeps.handlerOptions,
  );
