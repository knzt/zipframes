import { NotifyVideoFailedUseCase } from '../../../application/useCases/notifyVideoFailed/NotifyVideoFailedUseCase.js';
import { createNotificationRepository } from '../repositories/notificationRepository.js';
import {
  createDispatchNotificationUseCase,
  type DispatchNotificationExternalDeps,
} from './dispatchNotificationUseCase.js';

export const createNotifyVideoFailedUseCase = (
  externalDeps: DispatchNotificationExternalDeps,
): NotifyVideoFailedUseCase =>
  new NotifyVideoFailedUseCase(
    createNotificationRepository(externalDeps.prisma),
    createDispatchNotificationUseCase(externalDeps),
  );
