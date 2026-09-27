import { randomUUID } from 'node:crypto';

import type { PublishOptions, PublishPort, Publisher } from '@zipframes/communication';
import type { EventEnvelope } from '@zipframes/schemas';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';
import type { ConfirmChannel } from 'amqplib';

import type {
  EventPublisher,
  EventPublisherInput,
} from '../../application/interfaces/gateways/EventPublisher.js';

/**
 * Implements @zipframes/communication's PublishPort over an amqplib
 * confirm channel: `publish` only resolves once the broker has
 * acknowledged the message, rather than once it has merely been written
 * to the socket. The name comes from that package type. It is not an
 * interface declared in application/.
 */
export const createAmqpPublishPort = (channel: ConfirmChannel): PublishPort => ({
  publish: (envelope: EventEnvelope<unknown>, options: PublishOptions) =>
    new Promise<void>((resolve, reject) => {
      const ok = channel.publish(
        options.exchange,
        options.routingKey,
        Buffer.from(JSON.stringify(envelope)),
        { headers: options.headers, persistent: true, contentType: 'application/json' },
        (error) => {
          if (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } else {
            resolve();
          }
        },
      );

      if (!ok) {
        // Broker-side flow control: the channel is applying backpressure.
        // amqplib still queues the message and will call the confirm
        // callback once it clears, so there is nothing more to do here
        // than let that callback settle the promise.
      }
    }),
});

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
