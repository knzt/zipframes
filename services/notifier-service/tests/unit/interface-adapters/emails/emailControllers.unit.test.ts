import type { ConsumeContext } from '@zipframes/communication';
import { describe, expect, it, vi } from 'vitest';

import { VideoFailedController } from '../../../../src/interface-adapters/emails/VideoFailedController.js';
import { VideoProcessedController } from '../../../../src/interface-adapters/emails/VideoProcessedController.js';

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
