import { VideoProcessedController } from '../../../interface-adapters/VideoProcessedController.js';
import { createNotifyVideoProcessedUseCase } from '../use-cases/notifyVideoProcessedUseCase.js';
import type { NotificationControllerExternalDeps } from './userRegisteredController.js';

export const createVideoProcessedController = (
  externalDeps: NotificationControllerExternalDeps,
): VideoProcessedController =>
  new VideoProcessedController(
    createNotifyVideoProcessedUseCase(externalDeps),
    externalDeps.handlerOptions,
  );
