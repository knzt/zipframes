import type { RetryOptions } from '@zipframes/communication';
import { computeBackoffMs } from '@zipframes/communication';

import { UPLOADED_RETRY_QUEUE } from './topology.js';

export const ATTEMPT_HEADER = 'x-attempt';

export type SettleAction = 'ack' | 'retry' | 'dlq';

export type AmqpSettlePlan =
  | { readonly kind: 'ack' }
  | { readonly kind: 'dlq' }
  | {
      readonly kind: 'retry';
      readonly waitQueue: typeof UPLOADED_RETRY_QUEUE;
      readonly nextAttempt: number;
      readonly delayMs: number;
    };

/**
 * Pure settle planner for the AMQP adapter.
 * `retry` always routes to the TTL wait queue (never nack→DLQ).
 * `dlq` is the only path that dead-letters.
 */
export const planAmqpSettle = (
  action: SettleAction,
  attempt: number,
  retry: RetryOptions,
): AmqpSettlePlan => {
  if (action === 'ack') {
    return { kind: 'ack' };
  }
  if (action === 'dlq') {
    return { kind: 'dlq' };
  }
  return {
    kind: 'retry',
    waitQueue: UPLOADED_RETRY_QUEUE,
    nextAttempt: attempt + 1,
    delayMs: computeBackoffMs(attempt, retry),
  };
};
