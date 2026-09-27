import { describe, expect, it, vi } from 'vitest';

import {
  assertAmqpTopology,
  createIdentityAmqpTopology,
  EVENT_EXCHANGE,
} from '../../../../../src/infrastructure/messaging/amqplib/amqpTopology.js';

describe('createIdentityAmqpTopology', () => {
  it('asserts the events topic exchange', async () => {
    const topology = createIdentityAmqpTopology();
    expect(topology.exchanges).toEqual([{ name: EVENT_EXCHANGE, type: 'topic', durable: true }]);
    expect(topology.queues).toEqual([]);
    expect(topology.bindings).toEqual([]);

    const assertExchange = vi.fn(async () => undefined);
    await assertAmqpTopology({ assertExchange } as never);

    expect(assertExchange).toHaveBeenCalledWith(EVENT_EXCHANGE, 'topic', { durable: true });
  });
});
