import { describe, expect, it } from 'vitest';

import {
  toUserRegisteredOutboxRow,
  USER_REGISTERED_AGGREGATE_TYPE,
  USER_REGISTERED_EVENT_TYPE,
  USER_REGISTERED_VERSION,
} from '../../../../src/infrastructure/gateways/prismaEventOutbox.gateway.js';

describe('toUserRegisteredOutboxRow', () => {
  it('maps UserRegistered onto outbox columns without leaking extra fields', () => {
    const row = toUserRegisteredOutboxRow(
      {
        userId: '0194f3a0-0000-7000-8000-000000000001',
        name: 'Hellen Santos',
        email: 'hellen@example.com',
      },
      {
        id: '0194f3a0-0000-7000-8000-000000000002',
        correlationId: '0194f3a0-0000-7000-8000-000000000099',
        occurredAt: new Date('2026-01-01T12:00:00.000Z'),
      },
    );

    expect(row).toEqual({
      id: '0194f3a0-0000-7000-8000-000000000002',
      aggregateType: USER_REGISTERED_AGGREGATE_TYPE,
      aggregateId: '0194f3a0-0000-7000-8000-000000000001',
      eventType: USER_REGISTERED_EVENT_TYPE,
      version: USER_REGISTERED_VERSION,
      payload: {
        userId: '0194f3a0-0000-7000-8000-000000000001',
        name: 'Hellen Santos',
        email: 'hellen@example.com',
      },
      correlationId: '0194f3a0-0000-7000-8000-000000000099',
      occurredAt: new Date('2026-01-01T12:00:00.000Z'),
    });
    expect(JSON.stringify(row)).not.toContain('hashed:');
    expect(JSON.stringify(row.payload)).not.toContain('occurredAt');
  });
});
