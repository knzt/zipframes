import { describe, expect, it, vi } from 'vitest';

import type { Publisher } from '@zipframes/communication';
import { authService } from '@zipframes/schemas';

import { createAmqpEventPublisher } from '../../../../src/infrastructure/gateways/amqpEventPublisher.gateway.js';

describe('createAmqpEventPublisher', () => {
  it('publishes the envelope on the events exchange', async () => {
    const publish = vi.fn(async () => undefined);
    const publisher: Publisher = { publish };
    const events = createAmqpEventPublisher({
      publisher,
      createId: () => '44444444-4444-4444-8444-444444444444',
      now: () => new Date('2026-09-20T12:00:05.000Z'),
    });

    await events.publish({
      eventType: 'user.registered',
      correlationId: '22222222-2222-4222-8222-222222222222',
      payload: {
        userId: '11111111-1111-4111-8111-111111111111',
        name: 'Hellen Santos',
        email: 'hellen@example.com',
      },
    });

    expect(publish).toHaveBeenCalledWith(
      {
        eventId: '44444444-4444-4444-8444-444444444444',
        eventType: 'user.registered',
        version: 1,
        occurredAt: '2026-09-20T12:00:05.000Z',
        correlationId: '22222222-2222-4222-8222-222222222222',
        payload: {
          userId: '11111111-1111-4111-8111-111111111111',
          name: 'Hellen Santos',
          email: 'hellen@example.com',
        },
      },
      { exchange: 'zipframes.events', routingKey: 'user.registered' },
    );

    const envelope = publish.mock.calls[0]?.[0];
    expect(authService.userRegisteredEventSchema.safeParse(envelope).success).toBe(true);
  });
});
