import type { ConsumeContext } from '@zipframes/communication';
import { UnavailableError } from '@zipframes/core';
import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';
import { describe, expect, it, vi } from 'vitest';

import type { EventPublisher } from '../../../src/application/interfaces/gateways/EventPublisher.js';
import type { ProcessUploadedVideoUseCase } from '../../../src/application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';
import {
  ProcessUploadedVideoController,
  type ProcessUploadedVideoHandlerOptions,
} from '../../../src/interface-adapters/ProcessUploadedVideoController.js';

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

const deliver = async (
  execute: ProcessUploadedVideoUseCase['execute'],
  options: { readonly attempt?: number; readonly envelope?: unknown } & Partial<
    Omit<ProcessUploadedVideoHandlerOptions, 'retry'>
  > = {},
): Promise<{ context: ReturnType<typeof contextAt>; eventPublisher: EventPublisher }> => {
  const { attempt = 1, envelope = event, ...handlerOptions } = options;
  const eventPublisher: EventPublisher = { publish: vi.fn(async () => undefined) };
  const controller = new ProcessUploadedVideoController(
    { execute } as unknown as ProcessUploadedVideoUseCase,
    eventPublisher,
    { retry, ...handlerOptions },
  );
  const context = contextAt(attempt);

  await controller.handle({ envelope, headers: {}, routingKey: 'video.uploaded' }, context);

  return { context, eventPublisher };
};

describe('ProcessUploadedVideoController', () => {
  it('maps the event onto the use case and acks', async () => {
    const execute = vi.fn(async () => 'frames_packaged' as const);

    const { context } = await deliver(execute, { attempt: 2 });

    expect(execute).toHaveBeenCalledWith({
      ...event.payload,
      attempt: 2,
      correlationId: event.correlationId,
      uploadedAt: event.occurredAt,
    });
    expect(context.ack).toHaveBeenCalledOnce();
  });

  it('dead-letters a poison envelope without calling the use case', async () => {
    const execute = vi.fn();

    const { context, eventPublisher } = await deliver(execute, {
      envelope: { ...event, eventType: 'not.a.real.event' },
    });

    expect(execute).not.toHaveBeenCalled();
    expect(context.deadLetter).toHaveBeenCalledOnce();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('retries a failure while attempts remain, without video.failed', async () => {
    const { context, eventPublisher } = await deliver(async () => {
      throw new UnavailableError('STORAGE_DOWNLOAD_FAILED', 'down');
    });

    expect(context.retry).toHaveBeenCalledOnce();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('publishes video.failed and dead-letters on the last attempt', async () => {
    const { context, eventPublisher } = await deliver(
      async () => {
        throw new UnavailableError('FFMPEG_FAILED', 'busy');
      },
      { attempt: 5 },
    );

    expect(eventPublisher.publish).toHaveBeenCalledWith({
      eventType: 'video.failed',
      correlationId: event.correlationId,
      payload: {
        videoId: event.payload.videoId,
        ownerId: event.payload.ownerId,
        originalFileName: 'clip.mp4',
        uploadedAt: event.occurredAt,
        errorCode: 'FFMPEG_FAILED',
        reason: 'busy',
        attempts: 5,
      },
    });
    expect(context.deadLetter).toHaveBeenCalledOnce();
  });

  it('uses fallbacks when the last attempt throws a non-error', async () => {
    const { eventPublisher } = await deliver(
      async () => {
        // Exercises the branch where exhaustion does not carry an Error.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'offline';
      },
      { attempt: 5 },
    );

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          errorCode: 'UNEXPECTED',
          reason: 'max attempts exhausted',
        }),
      }),
    );
  });

  it('forwards the injected handler options', async () => {
    const runInContext = vi.fn(async (_event: VideoUploadedEvent, run: () => Promise<void>) =>
      run(),
    );
    const onOutcome = vi.fn();

    await deliver(async () => 'media_rejected', { runInContext, onOutcome });

    expect(runInContext).toHaveBeenCalledWith(event, expect.any(Function));
    expect(onOutcome).toHaveBeenCalledWith(
      { kind: 'handled', event, result: 'media_rejected' },
      expect.objectContaining({ attempt: 1 }),
    );
  });
});
