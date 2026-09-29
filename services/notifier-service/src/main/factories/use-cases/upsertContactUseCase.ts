import { UpsertContactUseCase } from '../../../application/useCases/upsertContact/UpsertContactUseCase.js';
import { createContactRepository } from '../repositories/contactRepository.js';
import { createNotificationRepository } from '../repositories/notificationRepository.js';
import {
  createSendNotificationEmailUseCase,
  type SendNotificationEmailExternalDeps,
} from './sendNotificationEmailUseCase.js';

export const createUpsertContactUseCase = (
  externalDeps: SendNotificationEmailExternalDeps,
): UpsertContactUseCase =>
  new UpsertContactUseCase(
    createContactRepository(externalDeps.prisma),
    createNotificationRepository(externalDeps.prisma),
    createSendNotificationEmailUseCase(externalDeps),
  );
