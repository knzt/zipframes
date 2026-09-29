import { UserRegisteredController } from '../../../../interface-adapters/contacts/UserRegisteredController.js';
import { createUpsertContactUseCase } from '../../use-cases/upsertContactUseCase.js';
import type { NotificationControllerExternalDeps } from '../externalDeps.js';

export const createUserRegisteredController = (
  externalDeps: NotificationControllerExternalDeps,
): UserRegisteredController =>
  new UserRegisteredController(
    createUpsertContactUseCase(externalDeps),
    externalDeps.handlerOptions,
  );
