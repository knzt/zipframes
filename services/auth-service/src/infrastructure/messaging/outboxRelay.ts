import type { Publisher } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas';

import { toEventEnvelope } from './outboxEnvelope.js';
import type { OutboxRow } from './outboxEnvelope.js';

export type ClaimedOutboxRow = Omit<OutboxRow, 'payload'> & {
  readonly payload: unknown;
  readonly attempts: number;
};

export type OutboxRelayHandleOutcome = 'published' | 'failed';

/**
 * Persistence the relay needs: claim unpublished rows, run the publish
 * callback while the row locks are held, then mark published or attempted.
 * Implemented in `repositories/prisma`; this module must not import Prisma.
 */
export interface OutboxRelayPersistence {
  readonly processPending: (input: {
    readonly maxAttempts: number;
    readonly batchSize: number;
    readonly handle: (row: ClaimedOutboxRow) => Promise<OutboxRelayHandleOutcome>;
  }) => Promise<{ publishedCount: number; exhausted: ClaimedOutboxRow[] }>;
}

export interface OutboxRelayOptions {
  readonly persistence: OutboxRelayPersistence;
  readonly publisher: Publisher;
  /** Stop selecting a row once it has been tried this many times. */
  readonly maxAttempts: number;
  /** Rows claimed per run. Kept small: the claim holds a row lock for as
   * long as publishing takes, and a smaller batch bounds that. */
  readonly batchSize?: number;
  readonly onPublishError?: (row: ClaimedOutboxRow, error: unknown) => void;
  /** Called after the transaction commits, once per row that just reached the limit. */
  readonly onExhausted?: (row: ClaimedOutboxRow) => void;
}

const DEFAULT_BATCH_SIZE = 20;

const asPayload = (value: unknown): Record<string, unknown> => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new Error('outbox payload is not an object');
};

/**
 * Publishes pending outbox rows, one call at a time; the caller decides the
 * schedule (a `setInterval` in `main/`, wired to graceful shutdown).
 *
 * The claim (`FOR UPDATE SKIP LOCKED`) and the mark-as-published both
 * happen inside the same database transaction as the publish call, so that
 * two replicas of this service never publish the same row twice. The
 * transaction stays open for as long as the broker round-trip takes.
 * `batchSize` bounds how many rows share that risk at once.
 *
 * A failed publish increments `attempts` and stays unpublished. Once
 * `attempts` reaches `maxAttempts` the row leaves the pending query and
 * stays in the table, where the seven-day cleanup (published rows only)
 * does not remove it.
 */
export const createOutboxRelay = (
  options: OutboxRelayOptions,
): { runOnce: () => Promise<number> } => {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const runOnce = async (): Promise<number> => {
    const { publishedCount, exhausted } = await options.persistence.processPending({
      maxAttempts: options.maxAttempts,
      batchSize,
      handle: async (row) => {
        try {
          const envelope = toEventEnvelope({ ...row, payload: asPayload(row.payload) });
          // Rows must publish in order, and the transaction they share
          // makes concurrent publishing pointless here anyway.
          await options.publisher.publish(envelope, {
            exchange: EVENT_EXCHANGE,
            routingKey: row.eventType,
          });
          return 'published';
        } catch (error) {
          options.onPublishError?.(row, error);
          return 'failed';
        }
      },
    });

    for (const row of exhausted) {
      options.onExhausted?.(row);
    }

    return publishedCount;
  };

  return { runOnce };
};
