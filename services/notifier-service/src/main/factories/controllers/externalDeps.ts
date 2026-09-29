import type { MessageHandlerOptions } from '@zipframes/communication';
import type { EventEnvelope } from '@zipframes/schemas/shared';

import type { SendNotificationEmailExternalDeps } from '../use-cases/sendNotificationEmailUseCase.js';

export interface NotificationControllerExternalDeps extends SendNotificationEmailExternalDeps {
  readonly handlerOptions: MessageHandlerOptions<EventEnvelope<unknown>, unknown>;
}
