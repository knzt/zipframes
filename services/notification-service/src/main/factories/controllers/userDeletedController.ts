import { UserDeletedController } from '../../../interface-adapters/UserDeletedController.js';
import { createDeleteContactUseCase } from '../use-cases/deleteContactUseCase.js';
import type { NotificationControllerExternalDeps } from './userRegisteredController.js';

export const createUserDeletedController = (
  externalDeps: NotificationControllerExternalDeps,
): UserDeletedController =>
  new UserDeletedController(
    createDeleteContactUseCase(externalDeps.prisma),
    externalDeps.handlerOptions,
  );
