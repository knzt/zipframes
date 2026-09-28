import { randomUUID } from 'node:crypto';

import { createNotifier, type Notifier, type Publisher } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

import type {
  EventPublisher,
  EventPublisherInput,
} from '../../application/interfaces/gateways/EventPublisher.js';

export class AmqpEventPublisherGateway implements EventPublisher {
  constructor(
    private readonly publisher: Publisher,
    private readonly notifier: Notifier = createNotifier(publisher),
  ) {}

  async publish(publication: EventPublisherInput): Promise<void> {
    if (publication.eventType === 'video.processed') {
      await this.notifier.videoProcessed({
        correlationId: publication.correlationId,
        payload: publication.payload,
      });
      return;
    }
    if (publication.eventType === 'video.failed') {
      await this.notifier.videoFailed({
        correlationId: publication.correlationId,
        payload: publication.payload,
      });
      return;
    }
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
