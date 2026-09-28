import { UserUpdatedController } from '../../../interface-adapters/UserUpdatedController.js';
import type { NotificationControllerExternalDeps } from './userRegisteredController.js';
import { createUpsertContactUseCase } from '../use-cases/upsertContactUseCase.js';

export const createUserUpdatedController = (
  externalDeps: NotificationControllerExternalDeps,
): UserUpdatedController =>
  new UserUpdatedController(createUpsertContactUseCase(externalDeps), externalDeps.handlerOptions);
