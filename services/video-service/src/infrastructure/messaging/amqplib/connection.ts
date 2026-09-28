import type {
  BrokerMessage,
  ConsumeHandler,
  MessageHeaders,
  PublishOptions,
  RetryOptions,
  Topology,
} from '@zipframes/communication';
import type { Pingable } from '@zipframes/core';
import type { EventEnvelope } from '@zipframes/schemas/shared';
import amqp, {
  type Channel,
  type ChannelModel,
  type ConfirmChannel,
  type ConsumeMessage,
} from 'amqplib';

import { ATTEMPT_HEADER, planAmqpSettle, readAttempt, type SettleAction } from './amqpSettle.js';

export type AmqpConnect = (url: string) => Promise<ChannelModel>;

export interface ConsumeOptions {
  readonly retry: RetryOptions;
  /** TTL queue a retried message waits in before coming back. */
  readonly waitQueue: string;
}

export interface RabbitMqConnection {
  /** Resolves only once the broker confirmed the message. */
  readonly publish: (envelope: EventEnvelope<unknown>, options: PublishOptions) => Promise<void>;
  readonly assertTopology: (topology: Topology) => Promise<void>;
  readonly consume: (
    queue: string,
    handler: ConsumeHandler,
    options: ConsumeOptions,
  ) => Promise<void>;
  /** Stops consuming, waits for in-flight messages, then closes. */
  readonly close: () => Promise<void>;
  readonly isConnected: () => boolean;
}

const DRAIN_TIMEOUT_MS = 30_000;
const DRAIN_POLL_MS = 50;

export const createAmqpPing = (connection: Pick<RabbitMqConnection, 'isConnected'>): Pingable => ({
  ping: () =>
    connection.isConnected() ? Promise.resolve() : Promise.reject(new Error('amqp disconnected')),
});

const headersFromAmqp = (message: ConsumeMessage): MessageHeaders => {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(message.properties.headers ?? {})) {
    headers[key] = value === undefined || value === null ? undefined : String(value);
  }
  return headers;
};

const confirmPublish = (
  channel: ConfirmChannel,
  envelope: EventEnvelope<unknown>,
  options: PublishOptions,
): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    // A `false` return is flow control: amqplib keeps the message buffered
    // and still calls the confirm callback, which settles the promise.
    channel.publish(
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
  });

export const createRabbitMqConnection = async (
  amqpUrl: string,
  prefetch: number,
  connect: AmqpConnect = (url) => amqp.connect(url),
): Promise<RabbitMqConnection> => {
  const connection = await connect(amqpUrl);
  const publishChannel = await connection.createConfirmChannel();
  const consumeChannel: Channel = await connection.createChannel();
  await consumeChannel.prefetch(prefetch);

  let connected = true;
  let accepting = true;
  let inFlight = 0;
  const consumerTags: string[] = [];

  connection.on('close', () => {
    connected = false;
  });
  connection.on('error', () => {
    connected = false;
  });

  const settleWith =
    (message: ConsumeMessage, attempt: number, options: ConsumeOptions) =>
    (action: SettleAction): void => {
      const plan = planAmqpSettle(action, attempt, options.retry, options.waitQueue);
      if (plan.kind === 'ack') {
        consumeChannel.ack(message);
        return;
      }
      if (plan.kind === 'dlq') {
        // No requeue: the queue's dead-letter exchange routes it to the DLQ.
        consumeChannel.nack(message, false, false);
        return;
      }
      const contentType: unknown = message.properties.contentType;
      consumeChannel.sendToQueue(plan.waitQueue, message.content, {
        persistent: true,
        contentType: typeof contentType === 'string' ? contentType : 'application/json',
        expiration: String(plan.delayMs),
        headers: { ...message.properties.headers, [ATTEMPT_HEADER]: plan.nextAttempt },
      });
      consumeChannel.ack(message);
    };

  const handleMessage = async (
    message: ConsumeMessage,
    handler: ConsumeHandler,
    options: ConsumeOptions,
  ): Promise<void> => {
    let envelope: unknown;
    try {
      envelope = JSON.parse(message.content.toString('utf8')) as unknown;
    } catch {
      consumeChannel.nack(message, false, false);
      return;
    }

    const attempt = readAttempt(message.properties.headers);
    const plan = settleWith(message, attempt, options);
    let settled = false;
    const settle = (action: SettleAction): Promise<void> => {
      if (!settled) {
        settled = true;
        plan(action);
      }
      return Promise.resolve();
    };

    const brokerMessage: BrokerMessage = {
      envelope,
      headers: headersFromAmqp(message),
      routingKey: message.fields.routingKey,
    };
    try {
      await handler(brokerMessage, {
        attempt,
        redelivered: message.fields.redelivered || attempt > 1,
        ack: () => settle('ack'),
        retry: () => settle('retry'),
        deadLetter: () => settle('dlq'),
      });
      await settle('ack');
    } catch {
      await settle('retry');
    }
  };

  return {
    isConnected: () => connected,

    publish: (envelope, options) => confirmPublish(publishChannel, envelope, options),

    assertTopology: async (topology) => {
      for (const exchange of topology.exchanges) {
        await publishChannel.assertExchange(exchange.name, exchange.type, {
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
        await publishChannel.assertQueue(queue.name, {
          durable: queue.durable ?? true,
          ...(Object.keys(args).length > 0 ? { arguments: args } : {}),
        });
      }
      for (const binding of topology.bindings) {
        await publishChannel.bindQueue(binding.queue, binding.exchange, binding.routingKey);
      }
    },

    consume: async (queue, handler, options) => {
      const { consumerTag } = await consumeChannel.consume(queue, (message) => {
        if (message === null) {
          return;
        }
        if (!accepting) {
          consumeChannel.nack(message, false, true);
          return;
        }
        inFlight += 1;
        void handleMessage(message, handler, options).finally(() => {
          inFlight -= 1;
        });
      });
      consumerTags.push(consumerTag);
    },

    close: async () => {
      accepting = false;
      for (const tag of consumerTags) {
        await consumeChannel.cancel(tag).catch(() => undefined);
      }
      const deadline = Date.now() + DRAIN_TIMEOUT_MS;
      while (inFlight > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
      }
      await consumeChannel.close().catch(() => undefined);
      await publishChannel.close().catch(() => undefined);
      await connection.close().catch(() => undefined);
      connected = false;
    },
  };
};
