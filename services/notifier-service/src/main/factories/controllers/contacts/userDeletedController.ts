import { UserDeletedController } from '../../../../interface-adapters/contacts/UserDeletedController.js';
import { createDeleteContactUseCase } from '../../use-cases/deleteContactUseCase.js';
import type { NotificationControllerExternalDeps } from '../externalDeps.js';

export const createUserDeletedController = (
  externalDeps: NotificationControllerExternalDeps,
): UserDeletedController =>
  new UserDeletedController(
    createDeleteContactUseCase(externalDeps.prisma),
    externalDeps.handlerOptions,
  );
