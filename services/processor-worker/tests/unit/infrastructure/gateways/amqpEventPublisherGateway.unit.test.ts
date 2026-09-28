import type { Publisher } from '@zipframes/communication';
import { describe, expect, it, vi } from 'vitest';

import { AmqpEventPublisherGateway } from '../../../../src/infrastructure/gateways/amqpEventPublisherGateway.js';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isoInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('AmqpEventPublisherGateway', () => {
  it('publishes the envelope on the events exchange', async () => {
    const publish = vi.fn(async () => undefined);
    const publisher: Publisher = { publish };
    const events = new AmqpEventPublisherGateway(publisher);

    await events.publish({
      eventType: 'video.processing.started',
      correlationId: '22222222-2222-4222-8222-222222222222',
      payload: { videoId: '11111111-1111-4111-8111-111111111111', attempt: 1 },
    });

    expect(publish).toHaveBeenCalledWith(
      {
        eventId: expect.stringMatching(uuidV4),
        eventType: 'video.processing.started',
        version: 1,
        occurredAt: expect.stringMatching(isoInstant),
        correlationId: '22222222-2222-4222-8222-222222222222',
        payload: { videoId: '11111111-1111-4111-8111-111111111111', attempt: 1 },
      },
      { exchange: 'zipframes.events', routingKey: 'video.processing.started' },
    );
  });

  it('publishes video.processed through createNotifier', async () => {
    const publish = vi.fn(async () => undefined);
    const publisher: Publisher = { publish };
    const events = new AmqpEventPublisherGateway(publisher);

    await events.publish({
      eventType: 'video.processed',
      correlationId: '22222222-2222-4222-8222-222222222222',
      payload: {
        videoId: '11111111-1111-4111-8111-111111111111',
        ownerId: '33333333-3333-4333-8333-333333333333',
        originalFileName: 'clip.mp4',
        resultKey: 'outputs/owner/video.zip',
        frameCount: 4,
        durationMs: 1200,
      },
    });

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'video.processed',
        payload: expect.objectContaining({
          ownerId: '33333333-3333-4333-8333-333333333333',
          originalFileName: 'clip.mp4',
        }),
      }),
      { exchange: 'zipframes.events', routingKey: 'video.processed' },
    );
  });
});
