import { NotifyVideoProcessedUseCase } from '../../../application/useCases/notifyVideoProcessed/NotifyVideoProcessedUseCase.js';
import { createNotificationRepository } from '../repositories/notificationRepository.js';
import {
  createSendNotificationEmailUseCase,
  type SendNotificationEmailExternalDeps,
} from './sendNotificationEmailUseCase.js';

export const createNotifyVideoProcessedUseCase = (
  externalDeps: SendNotificationEmailExternalDeps,
): NotifyVideoProcessedUseCase =>
  new NotifyVideoProcessedUseCase(
    createNotificationRepository(externalDeps.prisma),
    createSendNotificationEmailUseCase(externalDeps),
  );
