import type { ConfirmChannel } from 'amqplib';

import type { EventEnvelope } from '@zipframes/schemas';
import type { PublishOptions } from '@zipframes/communication';
import type { PublishPort } from '@zipframes/communication';

// Same caveat as amqp-connection.ts: unverified against a live broker.

/**
 * Implements @zipframes/communication's PublishPort over an amqplib
 * confirm channel: `publish` only resolves once the broker has
 * acknowledged the message (ADR-0007's publisher confirms), rather than
 * once it has merely been written to the socket.
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
