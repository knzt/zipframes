import { describe, expect, it } from 'vitest';

import { planAmqpSettle } from '../../../../../src/infrastructure/messaging/amqplib/amqpSettle.js';
import { UPLOADED_RETRY_QUEUE } from '../../../../../src/infrastructure/messaging/amqplib/amqpTopology.js';

describe('planAmqpSettle (adapter settle ≠ DLQ on retry)', () => {
  const retry = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 30_000 };

  it('routes retry to the TTL wait queue with incremented attempt', () => {
    const plan = planAmqpSettle('retry', 2, retry);
    expect(plan).toEqual({
      kind: 'retry',
      waitQueue: UPLOADED_RETRY_QUEUE,
      nextAttempt: 3,
      delayMs: 2000,
    });
  });

  it('never plans nack/dlq for retry action', () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const plan = planAmqpSettle('retry', attempt, retry);
      expect(plan.kind).toBe('retry');
      if (plan.kind === 'retry') {
        expect(plan.waitQueue).toBe(UPLOADED_RETRY_QUEUE);
        expect(plan.waitQueue).not.toContain('dlq');
      }
    }
  });

  it('plans dlq only for explicit dlq action', () => {
    expect(planAmqpSettle('dlq', 5, retry)).toEqual({ kind: 'dlq' });
  });

  it('plans ack without touching the wait queue', () => {
    expect(planAmqpSettle('ack', 1, retry)).toEqual({ kind: 'ack' });
  });
});
