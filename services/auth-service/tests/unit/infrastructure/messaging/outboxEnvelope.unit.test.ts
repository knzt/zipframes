import { describe, expect, it } from 'vitest';

import { authService } from '@zipframes/schemas';

import { toEventEnvelope } from '../../../../src/infrastructure/messaging/outboxEnvelope.js';
import type { OutboxRow } from '../../../../src/infrastructure/messaging/outboxEnvelope.js';

const row: OutboxRow = {
  id: '0194f3a0-0000-7000-8000-000000000001',
  eventType: 'user.registered',
  version: 1,
  payload: {
    userId: '0194f3a0-0000-7000-8000-000000000002',
    name: 'Hellen Santos',
    email: 'hellen@example.com',
  },
  correlationId: '0194f3a0-0000-7000-8000-000000000003',
  occurredAt: new Date('2026-01-01T12:00:00.000Z'),
};

describe('toEventEnvelope', () => {
  it('produces an envelope that satisfies the real user.registered schema', () => {
    const envelope = toEventEnvelope(row);

    const parsed = authService.userRegisteredEventSchema.safeParse(envelope);

    expect(parsed.success).toBe(true);
  });

  it('serializes occurredAt as an ISO date-time string, as the envelope schema requires', () => {
    const envelope = toEventEnvelope(row);

    expect(envelope.occurredAt).toBe('2026-01-01T12:00:00.000Z');
  });

  it('rejects, through the real schema, a payload missing a required field', () => {
    const badRow: OutboxRow = { ...row, payload: { userId: row.payload.userId } };

    const parsed = authService.userRegisteredEventSchema.safeParse(toEventEnvelope(badRow));

    expect(parsed.success).toBe(false);
  });

  it('rejects, through the real schema, a correlationId that is not a UUID', () => {
    const badRow: OutboxRow = { ...row, correlationId: 'not-a-uuid' };

    const parsed = authService.userRegisteredEventSchema.safeParse(toEventEnvelope(badRow));

    expect(parsed.success).toBe(false);
  });

  it('carries the id, type and version through unchanged', () => {
    const envelope = toEventEnvelope(row);

    expect(envelope).toMatchObject({
      eventId: row.id,
      eventType: 'user.registered',
      version: 1,
      correlationId: row.correlationId,
      payload: row.payload,
    });
  });
});
