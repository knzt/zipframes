import { UserUpdatedController } from '../../../../interface-adapters/contacts/UserUpdatedController.js';
import { createUpsertContactUseCase } from '../../use-cases/upsertContactUseCase.js';
import type { NotificationControllerExternalDeps } from '../externalDeps.js';

export const createUserUpdatedController = (
  externalDeps: NotificationControllerExternalDeps,
): UserUpdatedController =>
  new UserUpdatedController(createUpsertContactUseCase(externalDeps), externalDeps.handlerOptions);
