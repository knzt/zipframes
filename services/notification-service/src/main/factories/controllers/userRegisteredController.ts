import type { MessageHandlerOptions } from '@zipframes/communication';
import type { EventEnvelope } from '@zipframes/schemas/shared';

import { UserRegisteredController } from '../../../interface-adapters/UserRegisteredController.js';
import { createUpsertContactUseCase } from '../use-cases/upsertContactUseCase.js';
import type { DispatchNotificationExternalDeps } from '../use-cases/dispatchNotificationUseCase.js';

export interface NotificationControllerExternalDeps extends DispatchNotificationExternalDeps {
  readonly handlerOptions: MessageHandlerOptions<EventEnvelope<unknown>, unknown>;
}

export const createUserRegisteredController = (
  externalDeps: NotificationControllerExternalDeps,
): UserRegisteredController =>
  new UserRegisteredController(
    createUpsertContactUseCase(externalDeps),
    externalDeps.handlerOptions,
  );
