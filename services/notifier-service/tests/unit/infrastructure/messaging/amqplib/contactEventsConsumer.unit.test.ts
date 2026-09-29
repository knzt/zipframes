import type { ConsumeContext } from '@zipframes/communication';
import { describe, expect, it, vi } from 'vitest';

import { ContactEventsConsumer } from '../../../../../src/infrastructure/messaging/amqplib/contactEventsConsumer.js';

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

describe('ContactEventsConsumer', () => {
  it('routes identity events and dead-letters anything else', async () => {
    const userRegistered = { handle: vi.fn(async () => undefined) };
    const userUpdated = { handle: vi.fn(async () => undefined) };
    const userDeleted = { handle: vi.fn(async () => undefined) };
    const consumer = new ContactEventsConsumer({
      userRegistered,
      userUpdated,
      userDeleted,
    });
    const context = contextAt(1);

    await consumer.handle(
      {
        envelope: { ...envelope, eventType: 'user.registered', payload: {} },
        headers: {},
        routingKey: 'user.registered',
      },
      context,
    );
    expect(userRegistered.handle).toHaveBeenCalledOnce();

    await consumer.handle(
      {
        envelope: { ...envelope, eventType: 'video.processed', payload: {} },
        headers: {},
        routingKey: 'video.processed',
      },
      context,
    );
    expect(context.deadLetter).toHaveBeenCalledOnce();
  });
});
