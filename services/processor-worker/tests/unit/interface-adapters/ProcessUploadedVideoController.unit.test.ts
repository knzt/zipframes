import { UnavailableError } from '@zipframes/core';
import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';
import { describe, expect, it, vi } from 'vitest';

import type { EventPublisher } from '../../../src/application/interfaces/gateways/EventPublisher.js';
import type { ProcessUploadedVideoUseCase } from '../../../src/application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';
import { ProcessUploadedVideoController } from '../../../src/interface-adapters/ProcessUploadedVideoController.js';

const event: VideoUploadedEvent = {
  eventId: '33333333-3333-4333-8333-333333333333',
  eventType: 'video.uploaded',
  version: 1,
  occurredAt: '2026-09-22T12:00:00.000Z',
  correlationId: '22222222-2222-4222-8222-222222222222',
  payload: {
    videoId: '11111111-1111-4111-8111-111111111111',
    ownerId: 'user-1',
    sourceKey: 'uploads/user-1/11111111-1111-4111-8111-111111111111',
    originalFileName: 'clip.mp4',
    sizeBytes: 1024,
  },
};

const retry = { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 };

const setup = (
  execute: ProcessUploadedVideoUseCase['execute'],
): { controller: ProcessUploadedVideoController; eventPublisher: EventPublisher } => {
  const eventPublisher: EventPublisher = { publish: vi.fn(async () => undefined) };
  const controller = new ProcessUploadedVideoController(
    { execute } as unknown as ProcessUploadedVideoUseCase,
    eventPublisher,
    retry,
  );
  return { controller, eventPublisher };
};

describe('ProcessUploadedVideoController', () => {
  it('maps the envelope onto the use case and acks its outcome', async () => {
    const execute = vi.fn(async () => 'frames_packaged' as const);
    const { controller } = setup(execute);

    const decision = await controller.handle({ envelope: event, attempt: 2 });

    expect(execute).toHaveBeenCalledWith({
      videoId: event.payload.videoId,
      ownerId: event.payload.ownerId,
      sourceKey: event.payload.sourceKey,
      originalFileName: event.payload.originalFileName,
      sizeBytes: event.payload.sizeBytes,
      attempt: 2,
      correlationId: event.correlationId,
    });
    expect(decision).toEqual({ action: 'ack', event, outcome: 'frames_packaged' });
  });

  it('acks a rejected media', async () => {
    const { controller } = setup(async () => 'media_rejected');

    const decision = await controller.handle({ envelope: event, attempt: 1 });

    expect(decision).toMatchObject({ action: 'ack', outcome: 'media_rejected' });
  });

  it('dead-letters a poison envelope without calling the use case', async () => {
    const execute = vi.fn();
    const { controller, eventPublisher } = setup(execute);

    const decision = await controller.handle({
      envelope: { ...event, eventType: 'not.a.real.event' },
      attempt: 1,
    });

    expect(decision).toMatchObject({ action: 'dead_letter', reason: 'poison' });
    expect(execute).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('retries a retryable failure without publishing video.failed', async () => {
    const { controller, eventPublisher } = setup(async () => {
      throw new UnavailableError('STORAGE_DOWNLOAD_FAILED', 'down');
    });

    const decision = await controller.handle({ envelope: event, attempt: 1 });

    expect(decision).toEqual({
      action: 'retry',
      event,
      failure: { errorCode: 'STORAGE_DOWNLOAD_FAILED', retryable: true },
    });
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('treats a non-processing error as an unexpected retry', async () => {
    const { controller } = setup(async () => {
      throw new Error('socket hang up');
    });

    const decision = await controller.handle({ envelope: event, attempt: 1 });

    expect(decision).toMatchObject({
      action: 'retry',
      failure: { errorCode: 'UNEXPECTED' },
    });
  });

  it('publishes video.failed and dead-letters when attempts are exhausted', async () => {
    const { controller, eventPublisher } = setup(async () => {
      throw new UnavailableError('FFMPEG_FAILED', 'busy');
    });

    const decision = await controller.handle({ envelope: event, attempt: 5 });

    expect(eventPublisher.publish).toHaveBeenCalledWith({
      eventType: 'video.failed',
      correlationId: event.correlationId,
      payload: {
        videoId: event.payload.videoId,
        ownerId: event.payload.ownerId,
        errorCode: 'FFMPEG_FAILED',
        reason: 'busy',
        attempts: 5,
      },
    });
    expect(decision).toEqual({
      action: 'dead_letter',
      reason: 'retries_exhausted',
      event,
      failure: { errorCode: 'FFMPEG_FAILED', retryable: true },
    });
  });

  it('uses a fallback reason when exhaustion throws a non-error', async () => {
    const { controller, eventPublisher } = setup(async () => {
      // Exercises the branch where exhaustion does not carry an Error.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'offline';
    });

    await controller.handle({ envelope: event, attempt: 5 });

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'video.failed',
        payload: expect.objectContaining({
          errorCode: 'UNEXPECTED',
          reason: 'max attempts exhausted',
        }),
      }),
    );
  });
});
