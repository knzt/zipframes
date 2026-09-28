import { randomUUID } from 'node:crypto';

import type { Publisher } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

import type {
  EventPublisher,
  EventPublisherInput,
} from '../../application/interfaces/gateways/EventPublisher.js';

/** Builds the shared envelope and publishes on `zipframes.events`, routing key = event type. */
export class AmqpEventPublisherGateway implements EventPublisher {
  constructor(private readonly publisher: Publisher) {}

  async publish(publication: EventPublisherInput): Promise<void> {
    await this.publisher.publish(
      {
        eventId: randomUUID(),
        eventType: publication.eventType,
        version: 1,
        occurredAt: new Date().toISOString(),
        correlationId: publication.correlationId,
        payload: publication.payload,
      },
      { exchange: EVENT_EXCHANGE, routingKey: publication.eventType },
    );
  }
}
