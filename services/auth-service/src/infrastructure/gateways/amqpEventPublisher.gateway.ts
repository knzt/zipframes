import type { Publisher } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

import type {
  EventPublisher,
  EventPublisherInput,
} from '../../application/interfaces/gateways/EventPublisher.js';

export const createAmqpEventPublisher = (deps: {
  readonly publisher: Publisher;
  readonly createId: () => string;
  readonly now: () => Date;
}): EventPublisher => ({
  publish: async (input: EventPublisherInput) => {
    await deps.publisher.publish(
      {
        eventId: deps.createId(),
        eventType: input.eventType,
        version: 1,
        occurredAt: deps.now().toISOString(),
        correlationId: input.correlationId,
        payload: input.payload,
      },
      { exchange: EVENT_EXCHANGE, routingKey: input.eventType },
    );
  },
});
