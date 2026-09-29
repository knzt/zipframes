import { VideoProcessedController } from '../../../../interface-adapters/emails/VideoProcessedController.js';
import { createNotifyVideoProcessedUseCase } from '../../use-cases/notifyVideoProcessedUseCase.js';
import type { NotificationControllerExternalDeps } from '../externalDeps.js';

export const createVideoProcessedController = (
  externalDeps: NotificationControllerExternalDeps,
): VideoProcessedController =>
  new VideoProcessedController(
    createNotifyVideoProcessedUseCase(externalDeps),
    externalDeps.handlerOptions,
  );
