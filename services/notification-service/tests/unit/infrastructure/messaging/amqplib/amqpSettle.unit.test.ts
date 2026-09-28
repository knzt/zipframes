import { describe, expect, it } from 'vitest';

import {
  planAmqpSettle,
  readAttempt,
} from '../../../../../src/infrastructure/messaging/amqplib/amqpSettle.js';
import {
  NOTIFICATION_QUEUE,
  NOTIFICATION_RETRY_QUEUE,
} from '../../../../../src/infrastructure/messaging/amqplib/amqpTopology.js';

describe('planAmqpSettle', () => {
  const retry = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30_000 };

  it('routes retry to the TTL wait queue with incremented attempt', () => {
    const plan = planAmqpSettle('retry', 1, retry, NOTIFICATION_RETRY_QUEUE);
    expect(plan).toEqual({
      kind: 'retry',
      waitQueue: NOTIFICATION_RETRY_QUEUE,
      nextAttempt: 2,
      delayMs: 1000,
    });
  });

  it('never plans nack/dlq for retry', () => {
    const plan = planAmqpSettle('retry', 3, retry, NOTIFICATION_RETRY_QUEUE);
    expect(plan.kind).toBe('retry');
    if (plan.kind === 'retry') {
      expect(plan.waitQueue).toBe(NOTIFICATION_RETRY_QUEUE);
      expect(plan.waitQueue).not.toBe(NOTIFICATION_QUEUE);
    }
  });

  it('plans dlq only for an explicit dlq action', () => {
    expect(planAmqpSettle('dlq', 3, retry, NOTIFICATION_RETRY_QUEUE)).toEqual({ kind: 'dlq' });
  });

  it('plans ack without touching the wait queue', () => {
    expect(planAmqpSettle('ack', 1, retry, NOTIFICATION_RETRY_QUEUE)).toEqual({ kind: 'ack' });
  });
});

describe('readAttempt', () => {
  it('defaults to 1 when the header is missing', () => {
    expect(readAttempt(undefined)).toBe(1);
    expect(readAttempt({ 'x-attempt': '2' })).toBe(2);
  });
});
