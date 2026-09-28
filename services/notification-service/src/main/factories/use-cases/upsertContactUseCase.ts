import { UpsertContactUseCase } from '../../../application/useCases/upsertContact/UpsertContactUseCase.js';
import { createContactRepository } from '../repositories/contactRepository.js';
import { createNotificationRepository } from '../repositories/notificationRepository.js';
import {
  createDispatchNotificationUseCase,
  type DispatchNotificationExternalDeps,
} from './dispatchNotificationUseCase.js';

export const createUpsertContactUseCase = (
  externalDeps: DispatchNotificationExternalDeps,
): UpsertContactUseCase =>
  new UpsertContactUseCase(
    createContactRepository(externalDeps.prisma),
    createNotificationRepository(externalDeps.prisma),
    createDispatchNotificationUseCase(externalDeps),
  );
