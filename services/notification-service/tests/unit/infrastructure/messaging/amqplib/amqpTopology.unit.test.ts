import { describe, expect, it } from 'vitest';

import {
  createNotificationAmqpTopology,
  DEFAULT_EXCHANGE,
  DLQ_QUEUE,
  DLX_EXCHANGE,
  EVENT_EXCHANGE,
  NOTIFICATION_QUEUE,
  NOTIFICATION_RETRY_QUEUE,
  NOTIFICATION_ROUTING_KEYS,
} from '../../../../../src/infrastructure/messaging/amqplib/amqpTopology.js';

describe('createNotificationAmqpTopology', () => {
  it('returns expired retries to the service queue and dead-letters the main queue', () => {
    const topology = createNotificationAmqpTopology();
    const retry = topology.queues.find((queue) => queue.name === NOTIFICATION_RETRY_QUEUE);
    const main = topology.queues.find((queue) => queue.name === NOTIFICATION_QUEUE);

    expect(retry?.deadLetterExchange).toBe(DEFAULT_EXCHANGE);
    expect(retry?.deadLetterRoutingKey).toBe(NOTIFICATION_QUEUE);
    expect(main?.deadLetterExchange).toBe(DLX_EXCHANGE);
    expect(main?.deadLetterRoutingKey).toBe(NOTIFICATION_QUEUE);
    expect(topology.bindings).toEqual(
      expect.arrayContaining([
        { queue: DLQ_QUEUE, exchange: DLX_EXCHANGE, routingKey: '#' },
        ...NOTIFICATION_ROUTING_KEYS.map((routingKey) => ({
          queue: NOTIFICATION_QUEUE,
          exchange: EVENT_EXCHANGE,
          routingKey,
        })),
      ]),
    );
  });

  it('never routes a retry through the shared events exchange', () => {
    const retry = createNotificationAmqpTopology().queues.find(
      (queue) => queue.name === NOTIFICATION_RETRY_QUEUE,
    );

    expect(retry?.deadLetterExchange).not.toBe(EVENT_EXCHANGE);
    expect(retry?.deadLetterExchange).toBe(DEFAULT_EXCHANGE);
  });
});
