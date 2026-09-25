import { describe, expect, it } from 'vitest';

import {
  createProcessorTopology,
  DLQ_QUEUE,
  DLX_EXCHANGE,
  EVENT_EXCHANGE,
  UPLOADED_QUEUE,
  UPLOADED_RETRY_QUEUE,
} from '../../../../src/infrastructure/messaging/topology.js';

describe('createProcessorTopology', () => {
  it('returns expired wait-queue messages to the main queue and dead-letters the main queue', () => {
    const topology = createProcessorTopology();
    const wait = topology.queues.find((queue) => queue.name === UPLOADED_RETRY_QUEUE);
    const main = topology.queues.find((queue) => queue.name === UPLOADED_QUEUE);

    expect(wait?.deadLetterExchange).toBe(EVENT_EXCHANGE);
    expect(wait?.deadLetterRoutingKey).toBe('video.uploaded');
    expect(main?.deadLetterExchange).toBe(DLX_EXCHANGE);
    expect(main?.deadLetterRoutingKey).toBe(UPLOADED_QUEUE);
    expect(topology.bindings).toEqual(
      expect.arrayContaining([
        { queue: DLQ_QUEUE, exchange: DLX_EXCHANGE, routingKey: '#' },
        { queue: UPLOADED_QUEUE, exchange: EVENT_EXCHANGE, routingKey: 'video.uploaded' },
      ]),
    );
  });
});
