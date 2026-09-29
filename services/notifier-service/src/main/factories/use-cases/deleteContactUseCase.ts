import { DeleteContactUseCase } from '../../../application/useCases/deleteContact/DeleteContactUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import { createContactRepository } from '../repositories/contactRepository.js';
import { createNotificationRepository } from '../repositories/notificationRepository.js';

export const createDeleteContactUseCase = (prisma: Prisma): DeleteContactUseCase =>
  new DeleteContactUseCase(createContactRepository(prisma), createNotificationRepository(prisma));
