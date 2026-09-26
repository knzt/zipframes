import { randomUUID } from 'node:crypto';

import type { Publisher } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

import type {
  EventPublisher,
  EventPublisherInput,
} from '../../application/interfaces/gateways/EventPublisher.js';

export class AmqpEventPublisher implements EventPublisher {
  constructor(private readonly publisher: Publisher) {}

  async publish(input: EventPublisherInput): Promise<void> {
    await this.publisher.publish(
      {
        eventId: randomUUID(),
        eventType: input.eventType,
        version: 1,
        occurredAt: new Date().toISOString(),
        correlationId: input.correlationId,
        payload: input.payload,
      },
      { exchange: EVENT_EXCHANGE, routingKey: input.eventType },
    );
  }
}
