import { computeBackoffMs, type RetryOptions } from '@zipframes/communication';

export const ATTEMPT_HEADER = 'x-attempt';

export type SettleAction = 'ack' | 'retry' | 'dlq';

export type AmqpSettlePlan =
  | { readonly kind: 'ack' }
  | { readonly kind: 'dlq' }
  | {
      readonly kind: 'retry';
      readonly waitQueue: string;
      readonly nextAttempt: number;
      readonly delayMs: number;
    };

/**
 * Pure settle planner for the AMQP adapter. `retry` always goes to the TTL
 * wait queue with the next attempt number; `dlq` is the only path that
 * dead-letters.
 */
export const planAmqpSettle = (
  action: SettleAction,
  attempt: number,
  retry: RetryOptions,
  waitQueue: string,
): AmqpSettlePlan => {
  if (action === 'ack') {
    return { kind: 'ack' };
  }
  if (action === 'dlq') {
    return { kind: 'dlq' };
  }
  return {
    kind: 'retry',
    waitQueue,
    nextAttempt: attempt + 1,
    delayMs: computeBackoffMs(attempt, retry),
  };
};

/** Attempt carried by the message, 1 when absent or unreadable. */
export const readAttempt = (headers: Readonly<Record<string, unknown>> | undefined): number => {
  const value = headers?.[ATTEMPT_HEADER];
  const parsed =
    typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
};
