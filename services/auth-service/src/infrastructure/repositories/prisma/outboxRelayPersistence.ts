import { Prisma, type PrismaClient } from '@prisma/client';

import type { ClaimedOutboxRow, OutboxRelayPersistence } from '../../messaging/outboxRelay.js';

// Prisma binds a string[] as text[]. id is uuid, and Postgres has no uuid = text.
const uuidIn = (ids: readonly string[]): Prisma.Sql =>
  Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`));

/**
 * Claim/mark SQL for the outbox relay. Publish stays in messaging; this
 * file owns the transaction that holds `FOR UPDATE SKIP LOCKED` until the
 * broker ack (or failure) has been recorded.
 */
export const createPrismaOutboxRelayPersistence = (
  prisma: PrismaClient,
): OutboxRelayPersistence => ({
  processPending: async ({ maxAttempts, batchSize, handle }) => {
    const exhausted: ClaimedOutboxRow[] = [];

    const publishedCount = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
          AND attempts < ${maxAttempts}
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
          payload: raw.payload,
          correlationId: raw.correlationId,
          occurredAt: raw.occurredAt,
          attempts: raw.attempts,
        };
        const outcome = await handle(row);
        if (outcome === 'published') {
          publishedIds.push(row.id);
        } else {
          failedIds.push(row.id);
          if (row.attempts + 1 >= maxAttempts) {
            exhausted.push(row);
          }
        }
      }

      if (publishedIds.length > 0) {
        const ids = uuidIn(publishedIds);
        await tx.$executeRaw`
          UPDATE outbox SET published_at = now() WHERE id IN (${ids})
        `;
      }
      if (failedIds.length > 0) {
        const ids = uuidIn(failedIds);
        await tx.$executeRaw`
          UPDATE outbox SET attempts = attempts + 1 WHERE id IN (${ids})
        `;
      }

      return publishedIds.length;
    });

    return { publishedCount, exhausted };
  },
});
