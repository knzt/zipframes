import { describe, expect, it, vi } from 'vitest';

import type { Publisher } from '@zipframes/communication';
import { authService } from '@zipframes/schemas';

import { AmqpEventPublisher } from '../../../../src/infrastructure/gateways/amqpEventPublisher.gateway.js';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('AmqpEventPublisher', () => {
  it('publishes the envelope on the events exchange', async () => {
    const publish = vi.fn(async () => undefined);
    const publisher: Publisher = { publish };
    const eventPublisher = new AmqpEventPublisher(publisher);

    await eventPublisher.publish({
      eventType: 'user.registered',
      correlationId: '22222222-2222-4222-8222-222222222222',
      payload: {
        userId: '11111111-1111-4111-8111-111111111111',
        name: 'Hellen Santos',
        email: 'hellen@example.com',
      },
    });

    expect(publish).toHaveBeenCalledOnce();
    const [envelope, routing] = publish.mock.calls[0] ?? [];
    expect(envelope).toEqual({
      eventId: expect.stringMatching(uuidV4),
      eventType: 'user.registered',
      version: 1,
      occurredAt: expect.stringMatching(isoInstant),
      correlationId: '22222222-2222-4222-8222-222222222222',
      payload: {
        userId: '11111111-1111-4111-8111-111111111111',
        name: 'Hellen Santos',
        email: 'hellen@example.com',
      },
    });
    expect(routing).toEqual({ exchange: 'zipframes.events', routingKey: 'user.registered' });
    expect(authService.userRegisteredEventSchema.safeParse(envelope).success).toBe(true);
  });
});
