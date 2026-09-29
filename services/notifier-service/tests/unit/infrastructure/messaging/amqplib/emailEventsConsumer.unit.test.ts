import type { ConsumeContext } from '@zipframes/communication';
import { describe, expect, it, vi } from 'vitest';

import { EmailEventsConsumer } from '../../../../../src/infrastructure/messaging/amqplib/emailEventsConsumer.js';

const contextAt = (
  attempt: number,
): ConsumeContext & {
  readonly ack: ReturnType<typeof vi.fn>;
  readonly retry: ReturnType<typeof vi.fn>;
  readonly deadLetter: ReturnType<typeof vi.fn>;
} => ({
  attempt,
  redelivered: attempt > 1,
  ack: vi.fn(async () => undefined),
  retry: vi.fn(async () => undefined),
  deadLetter: vi.fn(async () => undefined),
});

const envelope = {
  eventId: '33333333-3333-4333-8333-333333333333',
  version: 1 as const,
  occurredAt: '2026-09-28T12:00:00.000Z',
  correlationId: '22222222-2222-4222-8222-222222222222',
};

describe('EmailEventsConsumer', () => {
  it('routes video outcomes and dead-letters identity events', async () => {
    const videoProcessed = { handle: vi.fn(async () => undefined) };
    const videoFailed = { handle: vi.fn(async () => undefined) };
    const consumer = new EmailEventsConsumer({ videoProcessed, videoFailed });
    const context = contextAt(1);

    await consumer.handle(
      {
        envelope: { ...envelope, eventType: 'video.failed', payload: {} },
        headers: {},
        routingKey: 'video.failed',
      },
      context,
    );
    expect(videoFailed.handle).toHaveBeenCalledOnce();

    await consumer.handle(
      {
        envelope: { ...envelope, eventType: 'user.registered', payload: {} },
        headers: {},
        routingKey: 'user.registered',
      },
      context,
    );
    expect(context.deadLetter).toHaveBeenCalledOnce();
  });
});
