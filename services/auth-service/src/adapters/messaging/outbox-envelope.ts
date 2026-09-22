import type { EventEnvelope } from '@zipframes/schemas';

export type OutboxRow = {
  readonly id: string;
  readonly eventType: string;
  readonly version: number;
  readonly payload: Record<string, unknown>;
  readonly correlationId: string;
  readonly occurredAt: Date;
};

/**
 * Turns a persisted outbox row into the envelope `@zipframes/schemas`
 * expects on the wire. Pure and side-effect free on purpose: it is the one
 * part of the relay that does not need a real Postgres or a real broker to
 * test, so it is tested against the actual published schemas rather than a
 * shape we assume matches them.
 */
export const toEventEnvelope = (row: OutboxRow): EventEnvelope<unknown> => ({
  eventId: row.id,
  eventType: row.eventType,
  version: row.version,
  occurredAt: row.occurredAt.toISOString(),
  correlationId: row.correlationId,
  payload: row.payload,
});
