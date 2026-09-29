import { NotifyVideoFailedUseCase } from '../../../application/useCases/notifyVideoFailed/NotifyVideoFailedUseCase.js';
import { createNotificationRepository } from '../repositories/notificationRepository.js';
import {
  createSendNotificationEmailUseCase,
  type SendNotificationEmailExternalDeps,
} from './sendNotificationEmailUseCase.js';

export const createNotifyVideoFailedUseCase = (
  externalDeps: SendNotificationEmailExternalDeps,
): NotifyVideoFailedUseCase =>
  new NotifyVideoFailedUseCase(
    createNotificationRepository(externalDeps.prisma),
    createSendNotificationEmailUseCase(externalDeps),
  );
