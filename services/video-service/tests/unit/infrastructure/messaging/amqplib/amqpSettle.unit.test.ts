import { describe, expect, it } from 'vitest';

import {
  ATTEMPT_HEADER,
  planAmqpSettle,
  readAttempt,
} from '../../../../../src/infrastructure/messaging/amqplib/amqpSettle.js';
import {
  createVideoServiceAmqpTopology,
  DEFAULT_EXCHANGE,
  EVENT_EXCHANGE,
  PROCESSING_STATUS_QUEUE,
  PROCESSING_STATUS_RETRY_QUEUE,
} from '../../../../../src/infrastructure/messaging/amqplib/amqpTopology.js';

const retry = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 30_000 };

describe('planAmqpSettle', () => {
  it('passes ack and dead-letter through', () => {
    expect(planAmqpSettle('ack', 1, retry, 'wait')).toEqual({ kind: 'ack' });
    expect(planAmqpSettle('dlq', 3, retry, 'wait')).toEqual({ kind: 'dlq' });
  });

  it('sends a retry to the wait queue with the next attempt and a capped backoff', () => {
    expect(planAmqpSettle('retry', 1, retry, 'wait')).toEqual({
      kind: 'retry',
      waitQueue: 'wait',
      nextAttempt: 2,
      delayMs: 1000,
    });
    expect(planAmqpSettle('retry', 10, retry, 'wait')).toMatchObject({ delayMs: 30_000 });
  });
});

describe('readAttempt', () => {
  it.each([
    [{ [ATTEMPT_HEADER]: 3 }, 3],
    [{ [ATTEMPT_HEADER]: '2' }, 2],
    [{ [ATTEMPT_HEADER]: 'x' }, 1],
    [{ [ATTEMPT_HEADER]: 0 }, 1],
    [{}, 1],
    [undefined, 1],
  ])('reads %j as attempt %d', (headers, expected) => {
    expect(readAttempt(headers)).toBe(expected);
  });
});

describe('createVideoServiceAmqpTopology', () => {
  const topology = createVideoServiceAmqpTopology();

  it('binds the three worker events to one queue', () => {
    expect(
      topology.bindings.filter((binding) => binding.queue === PROCESSING_STATUS_QUEUE),
    ).toEqual(
      ['video.processing.started', 'video.processed', 'video.failed'].map((routingKey) => ({
        queue: PROCESSING_STATUS_QUEUE,
        exchange: EVENT_EXCHANGE,
        routingKey,
      })),
    );
  });

  it('returns retries to the queue itself, never through the shared events exchange', () => {
    expect(topology.queues.find((queue) => queue.name === PROCESSING_STATUS_RETRY_QUEUE)).toEqual({
      name: PROCESSING_STATUS_RETRY_QUEUE,
      durable: true,
      deadLetterExchange: DEFAULT_EXCHANGE,
      deadLetterRoutingKey: PROCESSING_STATUS_QUEUE,
    });
  });
});
