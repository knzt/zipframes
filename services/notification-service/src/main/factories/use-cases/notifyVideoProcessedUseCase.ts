import { NotifyVideoProcessedUseCase } from '../../../application/useCases/notifyVideoProcessed/NotifyVideoProcessedUseCase.js';
import { createNotificationRepository } from '../repositories/notificationRepository.js';
import {
  createDispatchNotificationUseCase,
  type DispatchNotificationExternalDeps,
} from './dispatchNotificationUseCase.js';

export const createNotifyVideoProcessedUseCase = (
  externalDeps: DispatchNotificationExternalDeps,
): NotifyVideoProcessedUseCase =>
  new NotifyVideoProcessedUseCase(
    createNotificationRepository(externalDeps.prisma),
    createDispatchNotificationUseCase(externalDeps),
  );
