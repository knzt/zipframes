import type { MessageHandlerOptions } from '@zipframes/communication';
import type { EventEnvelope } from '@zipframes/schemas/shared';

import { UserRegisteredController } from '../../../interface-adapters/UserRegisteredController.js';
import type { SendNotificationEmailExternalDeps } from '../use-cases/sendNotificationEmailUseCase.js';
import { createUpsertContactUseCase } from '../use-cases/upsertContactUseCase.js';

export interface NotificationControllerExternalDeps extends SendNotificationEmailExternalDeps {
  readonly handlerOptions: MessageHandlerOptions<EventEnvelope<unknown>, unknown>;
}

export const createUserRegisteredController = (
  externalDeps: NotificationControllerExternalDeps,
): UserRegisteredController =>
  new UserRegisteredController(
    createUpsertContactUseCase(externalDeps),
    externalDeps.handlerOptions,
  );
