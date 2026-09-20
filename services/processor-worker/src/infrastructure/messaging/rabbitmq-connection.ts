import type {
  BrokerMessage,
  ConsumeHandler,
  MessageHeaders,
  PublishOptions,
  Topology,
} from '@zipframes/communication';
import type { EventEnvelope } from '@zipframes/schemas/shared';
import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';

export interface RabbitMqConnection {
  readonly publish: (envelope: EventEnvelope<unknown>, options: PublishOptions) => Promise<void>;
  readonly assertTopology: (topology: Topology) => Promise<void>;
  readonly consume: (queue: string, handler: ConsumeHandler) => Promise<void>;
  readonly close: () => Promise<void>;
}

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
  const deathHeader = headers['x-death'];
  if (Array.isArray(deathHeader) && deathHeader.length > 0) {
    const first: unknown = deathHeader[0];
    if (typeof first === 'object' && first !== null && 'count' in first) {
      const count = Number(first.count);
      if (Number.isFinite(count) && count >= 0) {
        return count + 1;
      }
    }
  }
  const headerValue: unknown = headers['x-attempt'];
  const parsed =
    typeof headerValue === 'number' || typeof headerValue === 'string'
      ? Number(headerValue)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
};

export const createRabbitMqConnection = async (amqpUrl: string): Promise<RabbitMqConnection> => {
  const connection: ChannelModel = await amqp.connect(amqpUrl);
  const channel: Channel = await connection.createChannel();
  await channel.prefetch(1);

  return {
    assertTopology: async (topology) => {
      for (const exchange of topology.exchanges) {
        await channel.assertExchange(exchange.name, exchange.type, {
          durable: exchange.durable ?? true,
        });
      }
      for (const queue of topology.queues) {
        const args: Record<string, string> = {};
        if (queue.deadLetterExchange) {
          args['x-dead-letter-exchange'] = queue.deadLetterExchange;
        }
        if (queue.deadLetterRoutingKey) {
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

    consume: async (queue, handler) => {
      await channel.consume(queue, (message) => {
        if (!message) {
          return;
        }

        void (async () => {
          let envelope: EventEnvelope<unknown>;
          try {
            envelope = JSON.parse(message.content.toString('utf8')) as EventEnvelope<unknown>;
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
          let settled = false;

          const settle = (action: 'ack' | 'retry' | 'dlq'): void => {
            if (settled) {
              return;
            }
            settled = true;
            if (action === 'ack') {
              channel.ack(message);
              return;
            }
            // nack without requeue → DLX configured on the queue
            channel.nack(message, false, false);
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
            settle('ack');
          } catch {
            settle('retry');
          }
        })();
      });
    },

    close: async () => {
      await channel.close();
      await connection.close();
    },
  };
};
