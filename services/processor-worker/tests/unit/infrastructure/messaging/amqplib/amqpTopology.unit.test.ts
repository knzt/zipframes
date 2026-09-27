import { describe, expect, it } from 'vitest';

import {
  createProcessorAmqpTopology,
  DEFAULT_EXCHANGE,
  DLQ_QUEUE,
  DLX_EXCHANGE,
  EVENT_EXCHANGE,
  UPLOADED_QUEUE,
  UPLOADED_RETRY_QUEUE,
} from '../../../../../src/infrastructure/messaging/amqplib/amqpTopology.js';

describe('createProcessorAmqpTopology', () => {
  it('returns expired retries to the main queue and dead-letters the main queue', () => {
    const topology = createProcessorAmqpTopology();
    const retry = topology.queues.find((queue) => queue.name === UPLOADED_RETRY_QUEUE);
    const main = topology.queues.find((queue) => queue.name === UPLOADED_QUEUE);

    expect(retry?.deadLetterExchange).toBe(DEFAULT_EXCHANGE);
    expect(retry?.deadLetterRoutingKey).toBe(UPLOADED_QUEUE);
    expect(main?.deadLetterExchange).toBe(DLX_EXCHANGE);
    expect(main?.deadLetterRoutingKey).toBe(UPLOADED_QUEUE);
    expect(topology.bindings).toEqual(
      expect.arrayContaining([
        { queue: DLQ_QUEUE, exchange: DLX_EXCHANGE, routingKey: '#' },
        { queue: UPLOADED_QUEUE, exchange: EVENT_EXCHANGE, routingKey: 'video.uploaded' },
      ]),
    );
  });

  it('never routes a retry through the shared events exchange', () => {
    const retry = createProcessorAmqpTopology().queues.find(
      (queue) => queue.name === UPLOADED_RETRY_QUEUE,
    );

    // Another subscriber of video.uploaded would get every retry as a new upload.
    expect(retry?.deadLetterExchange).not.toBe(EVENT_EXCHANGE);
  });
});
