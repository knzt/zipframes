import { randomUUID } from 'node:crypto';

import {
  createNotifierEmailHelper,
  type NotifierEmailHelper,
  type Publisher,
} from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

import type {
  EventPublisher,
  EventPublisherInput,
} from '../../application/interfaces/gateways/EventPublisher.js';

export class AmqpEventPublisherGateway implements EventPublisher {
  constructor(
    private readonly publisher: Publisher,
    private readonly emailHelper: NotifierEmailHelper = createNotifierEmailHelper(publisher),
  ) {}

  async publish(publication: EventPublisherInput): Promise<void> {
    if (publication.eventType === 'video.processed') {
      await this.emailHelper.videoProcessed({
        correlationId: publication.correlationId,
        payload: publication.payload,
      });
      return;
    }
    if (publication.eventType === 'video.failed') {
      await this.emailHelper.videoFailed({
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
