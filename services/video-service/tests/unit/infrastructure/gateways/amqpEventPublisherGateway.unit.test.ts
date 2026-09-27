import type { Publisher } from '@zipframes/communication';
import { describe, expect, it, vi } from 'vitest';

import { AmqpEventPublisherGateway } from '../../../../src/infrastructure/gateways/amqpEventPublisherGateway.js';
import { CORRELATION_ID, OWNER_ID, VIDEO_ID } from '../../../support/videos.js';

describe('AmqpEventPublisherGateway', () => {
  it('wraps the payload in the shared envelope and routes by event type', async () => {
    const publish = vi.fn(() => Promise.resolve());
    const publisher: Publisher = { publish };
    const gateway = new AmqpEventPublisherGateway(publisher);
    const payload = {
      videoId: VIDEO_ID,
      ownerId: OWNER_ID,
      sourceKey: `uploads/${OWNER_ID}/${VIDEO_ID}`,
      originalFileName: 'aula.mp4',
      sizeBytes: 2048,
    };

    await gateway.publish({ eventType: 'video.uploaded', correlationId: CORRELATION_ID, payload });

    expect(publish).toHaveBeenCalledWith(
      {
        eventId: expect.stringMatching(/^[0-9a-f-]{36}$/u) as string,
        eventType: 'video.uploaded',
        version: 1,
        occurredAt: expect.any(String) as string,
        correlationId: CORRELATION_ID,
        payload,
      },
      { exchange: 'zipframes.events', routingKey: 'video.uploaded' },
    );
  });
});
