import { describe, expect, it, vi } from 'vitest';

import {
  assertTopology,
  createIdentityTopology,
  EVENT_EXCHANGE,
} from '../../../../src/infrastructure/messaging/topology.js';

describe('createIdentityTopology', () => {
  it('asserts the events topic exchange', async () => {
    const topology = createIdentityTopology();
    expect(topology.exchanges).toEqual([{ name: EVENT_EXCHANGE, type: 'topic', durable: true }]);
    expect(topology.queues).toEqual([]);
    expect(topology.bindings).toEqual([]);

    const assertExchange = vi.fn(async () => undefined);
    await assertTopology({ assertExchange } as never);

    expect(assertExchange).toHaveBeenCalledWith(EVENT_EXCHANGE, 'topic', { durable: true });
  });
});
