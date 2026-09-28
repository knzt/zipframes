import type {
  BrokerMessage,
  ConsumeHandler,
  MessageHeaders,
  PublishOptions,
  Topology,
} from '@zipframes/communication';
import type { RetryOptions } from '@zipframes/communication';
import type { Pingable } from '@zipframes/core';
import type { EventEnvelope } from '@zipframes/schemas/shared';
import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';

import { ATTEMPT_HEADER, planAmqpSettle } from './amqpSettle.js';

export type AmqpConnect = (url: string) => Promise<ChannelModel>;

export interface RabbitMqConnection {
  readonly publish: (envelope: EventEnvelope<unknown>, options: PublishOptions) => Promise<void>;
  readonly assertTopology: (topology: Topology) => Promise<void>;
  readonly consume: (
    queue: string,
    handler: ConsumeHandler,
    options: { readonly retry: RetryOptions },
  ) => Promise<void>;
  readonly close: () => Promise<void>;
  readonly isConnected: () => boolean;
}

export const createAmqpPing = (connection: Pick<RabbitMqConnection, 'isConnected'>): Pingable => ({
  ping: () => {
    if (!connection.isConnected()) {
      return Promise.reject(new Error('amqp disconnected'));
    }
    return Promise.resolve();
  },
});

const headersFromAmqp = (message: ConsumeMessage): MessageHeaders => {
  const raw = message.properties.headers ?? {};
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    headers[key] = value === undefined || value === null ? undefined : String(value);
  }
  return headers;
};

const readAttempt = (message: ConsumeMessage): number => {
  const headers = message.properties.headers ?? {};
  const headerValue: unknown = headers[ATTEMPT_HEADER];
  const parsed =
    typeof headerValue === 'number' || typeof headerValue === 'string'
      ? Number(headerValue)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
};

export const createRabbitMqConnection = async (
  amqpUrl: string,
  connect: AmqpConnect = (url) => amqp.connect(url),
): Promise<RabbitMqConnection> => {
  const connection: ChannelModel = await connect(amqpUrl);
  const channel: Channel = await connection.createChannel();
  await channel.prefetch(1);

  let connected = true;
  let consumerTag: string | undefined;
  let inFlight = 0;
  let accepting = true;

  connection.on('close', () => {
    connected = false;
  });
  connection.on('error', () => {
    connected = false;
  });

  return {
    isConnected: () => connected,

    assertTopology: async (topology) => {
      for (const exchange of topology.exchanges) {
        await channel.assertExchange(exchange.name, exchange.type, {
          durable: exchange.durable ?? true,
        });
      }
      for (const queue of topology.queues) {
        const args: Record<string, string> = {};
        // `''` is a real target (the default exchange), so test for presence.
        if (queue.deadLetterExchange !== undefined) {
          args['x-dead-letter-exchange'] = queue.deadLetterExchange;
        }
        if (queue.deadLetterRoutingKey !== undefined) {
          args['x-dead-letter-routing-key'] = queue.deadLetterRoutingKey;
        }
        await channel.assertQueue(queue.name, {
          durable: queue.durable ?? true,
          arguments: Object.keys(args).length > 0 ? args : undefined,
        });
      }
      for (const binding of topology.bindings) {
        await channel.bindQueue(binding.queue, binding.exchange, binding.routingKey);
      }
    },

    publish: async (envelope, options) => {
      const payload = Buffer.from(JSON.stringify(envelope));
      const published = channel.publish(options.exchange, options.routingKey, payload, {
        contentType: 'application/json',
        persistent: true,
        headers: options.headers,
      });
      if (!published) {
        await new Promise<void>((resolve) => channel.once('drain', resolve));
      }
    },

    consume: async (queue, handler, options) => {
      const { consumerTag: tag } = await channel.consume(queue, (message) => {
        if (!message || !accepting) {
          if (message) {
            channel.nack(message, false, true);
          }
          return;
        }

        inFlight += 1;
        void (async () => {
          try {
            let envelope: unknown;
            try {
              envelope = JSON.parse(message.content.toString('utf8'));
            } catch {
              channel.nack(message, false, false);
              return;
            }

            const brokerMessage: BrokerMessage = {
              envelope,
              headers: headersFromAmqp(message),
              routingKey: message.fields.routingKey,
            };

            const attempt = readAttempt(message);
            const settleState = { done: false };

            const settle = (action: 'ack' | 'retry' | 'dlq'): void => {
              if (settleState.done) {
                return;
              }
              settleState.done = true;
              const plan = planAmqpSettle(action, attempt, options.retry);
              if (plan.kind === 'ack') {
                channel.ack(message);
                return;
              }
              if (plan.kind === 'dlq') {
                // nack without requeue → queue DLX → shared DLQ
                channel.nack(message, false, false);
                return;
              }

              const nextHeaders: Record<string, string | number> = {
                ...Object.fromEntries(
                  Object.entries(message.properties.headers ?? {}).flatMap(([key, value]) =>
                    value === undefined || value === null ? [] : [[key, value as string | number]],
                  ),
                ),
                [ATTEMPT_HEADER]: plan.nextAttempt,
              };
              const contentType =
                typeof message.properties.contentType === 'string'
                  ? message.properties.contentType
                  : 'application/json';
              channel.sendToQueue(plan.waitQueue, message.content, {
                persistent: true,
                contentType,
                expiration: String(plan.delayMs),
                headers: nextHeaders,
              });
              channel.ack(message);
            };

            try {
              await handler(brokerMessage, {
                attempt,
                redelivered: message.fields.redelivered || attempt > 1,
                ack: () => {
                  settle('ack');
                  return Promise.resolve();
                },
                retry: () => {
                  settle('retry');
                  return Promise.resolve();
                },
                deadLetter: () => {
                  settle('dlq');
                  return Promise.resolve();
                },
              });
              if (!settleState.done) {
                settle('ack');
              }
            } catch {
              settle('retry');
            }
          } finally {
            inFlight -= 1;
          }
        })();
      });
      consumerTag = tag;
    },

    close: async () => {
      accepting = false;
      if (consumerTag) {
        try {
          await channel.cancel(consumerTag);
        } catch {
          // channel may already be closing
        }
      }
      const deadline = Date.now() + 30_000;
      while (inFlight > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      try {
        await channel.close();
      } catch {
        // ignore
      }
      try {
        await connection.close();
      } catch {
        // ignore
      }
      connected = false;
    },
  };
};
