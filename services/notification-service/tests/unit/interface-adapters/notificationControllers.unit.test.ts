import type { ConsumeContext } from '@zipframes/communication';
import { describe, expect, it, vi } from 'vitest';

import { UserRegisteredController } from '../../../src/interface-adapters/UserRegisteredController.js';
import { UserUpdatedController } from '../../../src/interface-adapters/UserUpdatedController.js';
import { UserDeletedController } from '../../../src/interface-adapters/UserDeletedController.js';
import { VideoProcessedController } from '../../../src/interface-adapters/VideoProcessedController.js';
import { VideoFailedController } from '../../../src/interface-adapters/VideoFailedController.js';
import { NotificationEventsConsumer } from '../../../src/infrastructure/messaging/amqplib/notificationEventsConsumer.js';

const retry = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 };

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

const userId = '33333333-3333-4333-8333-333333333333';
const videoId = '11111111-1111-4111-8111-111111111111';

describe('identity controllers', () => {
  it('upserts a contact from user.registered', async () => {
    const execute = vi.fn(async () => undefined);
    const controller = new UserRegisteredController({ execute } as never, { retry });
    const context = contextAt(1);

    await controller.handle(
      {
        envelope: {
          ...envelope,
          eventType: 'user.registered',
          payload: { userId, name: 'Ada', email: 'ada@example.com' },
        },
        headers: {},
        routingKey: 'user.registered',
      },
      context,
    );

    expect(execute).toHaveBeenCalledWith({
      userId,
      name: 'Ada',
      email: 'ada@example.com',
      occurredAt: new Date('2026-09-28T12:00:00.000Z'),
    });
    expect(context.ack).toHaveBeenCalledOnce();
  });

  it('upserts a contact from user.updated', async () => {
    const execute = vi.fn(async () => undefined);
    const controller = new UserUpdatedController({ execute } as never, { retry });
    await controller.handle(
      {
        envelope: {
          ...envelope,
          eventType: 'user.updated',
          payload: { userId, name: 'Ada L', email: 'ada@new.example' },
        },
        headers: {},
        routingKey: 'user.updated',
      },
      contextAt(1),
    );
    expect(execute).toHaveBeenCalledWith({
      userId,
      name: 'Ada L',
      email: 'ada@new.example',
      occurredAt: new Date('2026-09-28T12:00:00.000Z'),
    });
  });

  it('deletes a contact from user.deleted', async () => {
    const execute = vi.fn(async () => undefined);
    const controller = new UserDeletedController({ execute } as never, { retry });
    await controller.handle(
      {
        envelope: { ...envelope, eventType: 'user.deleted', payload: { userId } },
        headers: {},
        routingKey: 'user.deleted',
      },
      contextAt(1),
    );
    expect(execute).toHaveBeenCalledWith(userId);
  });
});

describe('video controllers', () => {
  it('notifies VIDEO_PROCESSED with owner and file name', async () => {
    const execute = vi.fn(async () => null);
    const controller = new VideoProcessedController({ execute } as never, { retry });
    await controller.handle(
      {
        envelope: {
          ...envelope,
          eventType: 'video.processed',
          payload: {
            videoId,
            ownerId: userId,
            originalFileName: 'clip.mp4',
            resultKey: `outputs/${userId}/${videoId}.zip`,
            frameCount: 8,
            durationMs: 1200,
          },
        },
        headers: {},
        routingKey: 'video.processed',
      },
      contextAt(1),
    );
    expect(execute).toHaveBeenCalledWith({
      videoId,
      ownerId: userId,
      originalFileName: 'clip.mp4',
      resultKey: `outputs/${userId}/${videoId}.zip`,
      frameCount: 8,
    });
  });

  it('notifies VIDEO_FAILED with the original file name', async () => {
    const execute = vi.fn(async () => undefined);
    const controller = new VideoFailedController({ execute } as never, { retry });
    await controller.handle(
      {
        envelope: {
          ...envelope,
          eventType: 'video.failed',
          payload: {
            videoId,
            ownerId: userId,
            originalFileName: 'clip.mp4',
            errorCode: 'NO_FRAMES',
            reason: 'no frames extracted',
            attempts: 1,
            uploadedAt: '2026-09-22T12:00:00.000Z',
          },
        },
        headers: {},
        routingKey: 'video.failed',
      },
      contextAt(1),
    );
    expect(execute).toHaveBeenCalledWith({
      videoId,
      ownerId: userId,
      originalFileName: 'clip.mp4',
      uploadedAt: new Date('2026-09-22T12:00:00.000Z'),
    });
  });
});

describe('NotificationEventsConsumer', () => {
  it('routes by eventType and dead-letters an unknown type', async () => {
    const userRegistered = { handle: vi.fn(async () => undefined) };
    const userUpdated = { handle: vi.fn(async () => undefined) };
    const userDeleted = { handle: vi.fn(async () => undefined) };
    const videoProcessed = { handle: vi.fn(async () => undefined) };
    const videoFailed = { handle: vi.fn(async () => undefined) };
    const consumer = new NotificationEventsConsumer({
      userRegistered,
      userUpdated,
      userDeleted,
      videoProcessed,
      videoFailed,
    });
    const context = contextAt(1);

    await consumer.handle(
      {
        envelope: { ...envelope, eventType: 'video.processed', payload: {} },
        headers: {},
        routingKey: 'video.processed',
      },
      context,
    );
    expect(videoProcessed.handle).toHaveBeenCalledOnce();

    await consumer.handle(
      {
        envelope: { ...envelope, eventType: 'not.a.real.event', payload: {} },
        headers: {},
        routingKey: 'not.a.real.event',
      },
      context,
    );
    expect(context.deadLetter).toHaveBeenCalledOnce();
  });
});
