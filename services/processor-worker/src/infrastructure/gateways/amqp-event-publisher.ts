import type { Publisher } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

import type {
  EventPublisher,
  ProcessingPublication,
} from '../../application/gateways/event-publisher.js';

export const createAmqpEventPublisher = (deps: {
  readonly publisher: Publisher;
  readonly createId: () => string;
  readonly now: () => Date;
}): EventPublisher => ({
  publish: async (event: ProcessingPublication) => {
    await deps.publisher.publish(
      {
        eventId: deps.createId(),
        eventType: event.eventType,
        version: 1,
        occurredAt: deps.now().toISOString(),
        correlationId: event.correlationId,
        payload: event.payload,
      },
      { exchange: EVENT_EXCHANGE, routingKey: event.eventType },
    );
  },
});
