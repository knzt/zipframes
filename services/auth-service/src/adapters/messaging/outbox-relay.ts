import type { Prisma, PrismaClient } from '@prisma/client';

import { EVENT_EXCHANGE } from '@zipframes/schemas';
import type { Publisher } from '@zipframes/communication';

import { toEventEnvelope } from './outbox-envelope.js';
import type { OutboxRow } from './outbox-envelope.js';

export type OutboxRelayOptions = {
  readonly prisma: PrismaClient;
  readonly publisher: Publisher;
  /** Rows claimed per run. Kept small: the claim holds a row lock for as
   * long as publishing takes, and a smaller batch bounds that. */
  readonly batchSize?: number;
  readonly onPublishError?: (row: OutboxRow, error: unknown) => void;
};

const DEFAULT_BATCH_SIZE = 20;

/**
 * Publishes pending outbox rows, one call at a time; the caller decides the
 * schedule (a `setInterval` in `main/`, wired to graceful shutdown).
 *
 * The claim (`FOR UPDATE SKIP LOCKED`) and the mark-as-published both
 * happen inside the same transaction as the publish call, so that two
 * replicas of this service never publish the same row twice: whichever
 * replica's transaction locks a row first is the only one that sees it.
 * The trade-off is real and deliberate — the transaction stays open for as
 * long as the broker round-trip takes, longer than a transaction touching
 * only Postgres would. `batchSize` bounds how many rows share that risk at
 * once.
 *
 * This file could not be typechecked against a generated Prisma Client in
 * this environment (see the PR description) and needs an integration test
 * against a real Postgres before it can be trusted; `outbox-envelope.ts`
 * carries what could be verified without one.
 */
export const createOutboxRelay = (options: OutboxRelayOptions): { runOnce: () => Promise<number> } => {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const runOnce = async (): Promise<number> => {
    let publishedCount = 0;

    await options.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT
          id,
          event_type   AS "eventType",
          version,
          payload,
          correlation_id AS "correlationId",
          occurred_at    AS "occurredAt"
        FROM outbox
        WHERE published_at IS NULL
        ORDER BY occurred_at
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      `;

      const publishedIds: string[] = [];
      for (const row of rows) {
        try {
          const envelope = toEventEnvelope(row);
          // eslint-disable-next-line no-await-in-loop -- rows must publish
          // in order, and the transaction they share makes concurrent
          // publishing pointless here anyway.
          await options.publisher.publish(envelope, {
            exchange: EVENT_EXCHANGE,
            routingKey: row.eventType,
          });
          publishedIds.push(row.id);
        } catch (error) {
          options.onPublishError?.(row, error);
        }
      }

      if (publishedIds.length > 0) {
        await tx.$executeRaw`
          UPDATE outbox SET published_at = now() WHERE id = ANY(${publishedIds})
        `;
      }
      publishedCount = publishedIds.length;
    });

    return publishedCount;
  };

  return { runOnce };
};
