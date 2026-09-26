import type { Publisher } from '@zipframes/communication';
import { describe, expect, it, vi } from 'vitest';

import { AmqpEventPublisher } from '../../../../src/infrastructure/gateways/amqpEventPublisher.gateway.js';

describe('AmqpEventPublisher', () => {
  it('publishes the envelope on the events exchange', async () => {
    const publish = vi.fn(async () => undefined);
    const publisher: Publisher = { publish };
    const events = new AmqpEventPublisher({
      publisher,
      createId: () => '44444444-4444-4444-8444-444444444444',
      now: () => new Date('2026-09-20T12:00:05.000Z'),
    });

    await events.publish({
      eventType: 'video.processing.started',
      correlationId: '22222222-2222-4222-8222-222222222222',
      payload: { videoId: '11111111-1111-4111-8111-111111111111', attempt: 1 },
    });

    expect(publish).toHaveBeenCalledWith(
      {
        eventId: '44444444-4444-4444-8444-444444444444',
        eventType: 'video.processing.started',
        version: 1,
        occurredAt: '2026-09-20T12:00:05.000Z',
        correlationId: '22222222-2222-4222-8222-222222222222',
        payload: { videoId: '11111111-1111-4111-8111-111111111111', attempt: 1 },
      },
      { exchange: 'zipframes.events', routingKey: 'video.processing.started' },
    );
  });
});
