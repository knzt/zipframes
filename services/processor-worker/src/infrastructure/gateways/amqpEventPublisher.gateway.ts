import type { Publisher } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

import type {
  EventPublisher,
  EventPublisherInput,
} from '../../application/interfaces/gateways/EventPublisher.js';

export class AmqpEventPublisher implements EventPublisher {
  constructor(
    private readonly deps: {
      readonly publisher: Publisher;
      readonly createId: () => string;
      readonly now: () => Date;
    },
  ) {}

  async publish(input: EventPublisherInput): Promise<void> {
    await this.deps.publisher.publish(
      {
        eventId: this.deps.createId(),
        eventType: input.eventType,
        version: 1,
        occurredAt: this.deps.now().toISOString(),
        correlationId: input.correlationId,
        payload: input.payload,
      },
      { exchange: EVENT_EXCHANGE, routingKey: input.eventType },
    );
  }
}
