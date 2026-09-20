import type { Publisher } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

import type { EventPublisher } from '../../application/gateways/event-publisher.js';

export const createAmqpEventPublisher = (deps: {
  readonly publisher: Publisher;
  readonly createId: () => string;
  readonly now: () => Date;
}): EventPublisher => ({
  publish: async ({ eventType, correlationId, payload }) => {
    await deps.publisher.publish(
      {
        eventId: deps.createId(),
        eventType,
        version: 1,
        occurredAt: deps.now().toISOString(),
        correlationId,
        payload,
      },
      { exchange: EVENT_EXCHANGE, routingKey: eventType },
    );
  },
});
