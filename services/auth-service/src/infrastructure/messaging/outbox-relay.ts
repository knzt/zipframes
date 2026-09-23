import type { Prisma, PrismaClient } from '@prisma/client';

import type { Publisher } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas';

import { toEventEnvelope } from './outbox-envelope.js';
import type { OutboxRow } from './outbox-envelope.js';

export type ClaimedOutboxRow = OutboxRow & {
  readonly attempts: number;
};

export interface OutboxRelayOptions {
  readonly prisma: PrismaClient;
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
 * happen inside the same transaction as the publish call, so that two
 * replicas of this service never publish the same row twice. The
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
    const exhausted: ClaimedOutboxRow[] = [];

    const publishedCount = await options.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const rows = await tx.$queryRaw<
          {
            id: string;
            eventType: string;
            version: number;
            payload: unknown;
            correlationId: string;
            occurredAt: Date;
            attempts: number;
          }[]
        >`
        SELECT
          id,
          event_type   AS "eventType",
          version,
          payload,
          correlation_id AS "correlationId",
          occurred_at    AS "occurredAt",
          attempts
        FROM outbox
        WHERE published_at IS NULL
          AND attempts < ${options.maxAttempts}
        ORDER BY occurred_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `;

        const publishedIds: string[] = [];
        const failedIds: string[] = [];

        for (const raw of rows) {
          const row: ClaimedOutboxRow = {
            id: raw.id,
            eventType: raw.eventType,
            version: raw.version,
            payload: {},
            correlationId: raw.correlationId,
            occurredAt: raw.occurredAt,
            attempts: raw.attempts,
          };
          try {
            const claimed: ClaimedOutboxRow = { ...row, payload: asPayload(raw.payload) };
            const envelope = toEventEnvelope(claimed);
            // Rows must publish in order, and the transaction they share
            // makes concurrent publishing pointless here anyway.
            await options.publisher.publish(envelope, {
              exchange: EVENT_EXCHANGE,
              routingKey: row.eventType,
            });
            publishedIds.push(row.id);
          } catch (error) {
            options.onPublishError?.(row, error);
            failedIds.push(row.id);
            if (row.attempts + 1 >= options.maxAttempts) {
              exhausted.push(row);
            }
          }
        }

        if (publishedIds.length > 0) {
          await tx.$executeRaw`
          UPDATE outbox SET published_at = now() WHERE id = ANY(${publishedIds})
        `;
        }
        if (failedIds.length > 0) {
          await tx.$executeRaw`
          UPDATE outbox SET attempts = attempts + 1 WHERE id = ANY(${failedIds})
        `;
        }

        return publishedIds.length;
      },
    );

    for (const row of exhausted) {
      options.onExhausted?.(row);
    }

    return publishedCount;
  };

  return { runOnce };
};
