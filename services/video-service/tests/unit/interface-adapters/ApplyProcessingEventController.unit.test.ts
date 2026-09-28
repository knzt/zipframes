import type { ConsumeContext } from '@zipframes/communication';
import { describe, expect, it, vi } from 'vitest';

import type { ApplyProcessingEventUseCase } from '../../../src/application/useCases/applyProcessingEvent/ApplyProcessingEventUseCase.js';
import { ApplyProcessingEventController } from '../../../src/interface-adapters/ApplyProcessingEventController.js';
import { CORRELATION_ID, OWNER_ID, VIDEO_ID } from '../../support/videos.js';

const envelope = (
  eventType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> => ({
  eventId: '0194f3a0-0000-7000-8000-00000000e005',
  eventType,
  version: 1,
  occurredAt: '2026-09-27T12:00:00.000Z',
  correlationId: CORRELATION_ID,
  payload,
});

const contextFor = (attempt = 1): { context: ConsumeContext; settled: string[] } => {
  const settled: string[] = [];
  const context: ConsumeContext = {
    attempt,
    redelivered: attempt > 1,
    ack: () => Promise.resolve(void settled.push('ack')),
    retry: () => Promise.resolve(void settled.push('retry')),
    deadLetter: () => Promise.resolve(void settled.push('dlq')),
  };
  return { context, settled };
};

const controllerWith = (
  execute: ApplyProcessingEventUseCase['execute'],
  maxAttempts = 3,
): ApplyProcessingEventController =>
  new ApplyProcessingEventController({ execute } as unknown as ApplyProcessingEventUseCase, {
    retry: { maxAttempts, baseDelayMs: 1, maxDelayMs: 1 },
  });

describe('ApplyProcessingEventController', () => {
  it.each([
    [
      'video.processing.started',
      { videoId: VIDEO_ID, attempt: 1 },
      { videoId: VIDEO_ID, event: { kind: 'started' } },
    ],
    [
      'video.processed',
      {
        videoId: VIDEO_ID,
        resultKey: `outputs/${OWNER_ID}/${VIDEO_ID}.zip`,
        frameCount: 4,
        durationMs: 90,
      },
      {
        videoId: VIDEO_ID,
        event: {
          kind: 'completed',
          resultKey: `outputs/${OWNER_ID}/${VIDEO_ID}.zip`,
          frameCount: 4,
        },
      },
    ],
    [
      'video.failed',
      {
        videoId: VIDEO_ID,
        ownerId: OWNER_ID,
        errorCode: 'NO_FRAMES',
        reason: 'no frames',
        attempts: 2,
      },
      { videoId: VIDEO_ID, event: { kind: 'failed', errorCode: 'NO_FRAMES', reason: 'no frames' } },
    ],
  ])('maps %s onto the use case and acks', async (eventType, payload, expected) => {
    const execute = vi.fn(() =>
      Promise.resolve({ kind: 'applied' as const, status: 'DONE' as const }),
    );
    const { context, settled } = contextFor();

    await controllerWith(execute).handle(
      { envelope: envelope(eventType, payload), headers: {}, routingKey: eventType },
      context,
    );

    expect(execute).toHaveBeenCalledWith(expected);
    expect(settled).toEqual(['ack']);
  });

  it('dead-letters an envelope that matches none of the three events', async () => {
    const execute = vi.fn();
    const { context, settled } = contextFor();

    await controllerWith(execute).handle(
      { envelope: envelope('video.uploaded', { videoId: VIDEO_ID }), headers: {}, routingKey: 'x' },
      context,
    );

    expect(execute).not.toHaveBeenCalled();
    expect(settled).toEqual(['dlq']);
  });

  it('retries a failing attempt and dead-letters the last one', async () => {
    const execute = vi.fn(() => Promise.reject(new Error('db down')));
    const message = {
      envelope: envelope('video.processing.started', { videoId: VIDEO_ID, attempt: 1 }),
      headers: {},
      routingKey: 'video.processing.started',
    };
    const first = contextFor(1);
    const last = contextFor(3);

    await controllerWith(execute).handle(message, first.context);
    await controllerWith(execute).handle(message, last.context);

    expect(first.settled).toEqual(['retry']);
    expect(last.settled).toEqual(['dlq']);
  });
});
