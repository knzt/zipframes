import type { ConsumeContext } from '@zipframes/communication';
import { createLogger } from '@zipframes/logger';
import { getCorrelationId } from '@zipframes/logger';
import { describe, expect, it, vi } from 'vitest';

import type { EventPublisher } from '../../../../src/application/interfaces/gateways/EventPublisher.js';
import type { ProcessUploadedVideoUseCase } from '../../../../src/application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';
import { ProcessingError } from '../../../../src/domain/errors/processingError.js';
import { createVideoUploadedConsumer } from '../../../../src/infrastructure/messaging/videoUploadedConsumer.js';

const ownerId = 'user-1';
const videoId = '11111111-1111-4111-8111-111111111111';
const correlationId = '22222222-2222-4222-8222-222222222222';

const uploadedEnvelope = {
  eventId: '33333333-3333-4333-8333-333333333333',
  eventType: 'video.uploaded' as const,
  version: 1 as const,
  occurredAt: '2026-09-20T12:00:00.000Z',
  correlationId,
  payload: {
    videoId,
    ownerId,
    sourceKey: `uploads/${ownerId}/${videoId}`,
    originalFileName: 'demo.mp4',
    sizeBytes: 1024,
  },
};

const silentLogger = createLogger({
  service: 'processor-worker-test',
  version: '0.0.0',
  level: 'error',
  destination: { write: () => undefined },
});

const createContext = (
  attempt: number,
): ConsumeContext & {
  readonly ack: ReturnType<typeof vi.fn>;
  readonly retry: ReturnType<typeof vi.fn>;
  readonly deadLetter: ReturnType<typeof vi.fn>;
} => {
  const ack = vi.fn(async () => undefined);
  const retry = vi.fn(async () => undefined);
  const deadLetter = vi.fn(async () => undefined);
  return {
    attempt,
    redelivered: attempt > 1,
    ack,
    retry,
    deadLetter,
  };
};

const useCaseWith = (
  execute: ProcessUploadedVideoUseCase['execute'],
): ProcessUploadedVideoUseCase => ({ execute }) as unknown as ProcessUploadedVideoUseCase;

describe('failure contract: video uploaded consumer', () => {
  it('passes the decoded envelope to the use case', async () => {
    const execute = vi.fn(async () => 'frames_packaged' as const);
    const context = createContext(2);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: useCaseWith(execute),
      events: { publish: async () => undefined },
      retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 },
      logger: silentLogger,
    });

    await consumer(
      { envelope: uploadedEnvelope, headers: {}, routingKey: 'video.uploaded' },
      context,
    );

    expect(execute).toHaveBeenCalledWith({
      videoId,
      ownerId,
      sourceKey: uploadedEnvelope.payload.sourceKey,
      originalFileName: uploadedEnvelope.payload.originalFileName,
      sizeBytes: uploadedEnvelope.payload.sizeBytes,
      attempt: 2,
      correlationId,
    });
  });

  it('acks after the use case rejects the media', async () => {
    const events: EventPublisher = { publish: vi.fn(async () => undefined) };
    const context = createContext(1);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: useCaseWith(async () => 'media_rejected'),
      events,
      retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 },
      logger: silentLogger,
    });

    await consumer(
      { envelope: uploadedEnvelope, headers: {}, routingKey: 'video.uploaded' },
      context,
    );

    expect(context.ack).toHaveBeenCalledOnce();
    expect(context.retry).not.toHaveBeenCalled();
    expect(context.deadLetter).not.toHaveBeenCalled();
  });

  it('retries retryable failures without publishing video.failed', async () => {
    const events: EventPublisher = { publish: vi.fn(async () => undefined) };
    const context = createContext(1);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: useCaseWith(async () => {
        throw new ProcessingError(true, 'STORAGE_DOWNLOAD_FAILED', 'down');
      }),
      events,
      retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 },
      logger: silentLogger,
    });

    await consumer(
      { envelope: uploadedEnvelope, headers: {}, routingKey: 'video.uploaded' },
      context,
    );

    expect(context.retry).toHaveBeenCalledOnce();
    expect(context.deadLetter).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('publishes video.failed then DLQs when attempts are exhausted', async () => {
    const events: EventPublisher = { publish: vi.fn(async () => undefined) };
    const context = createContext(5);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: useCaseWith(async () => {
        throw new ProcessingError(true, 'FFMPEG_FAILED', 'busy');
      }),
      events,
      retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 },
      logger: silentLogger,
    });

    await consumer(
      { envelope: uploadedEnvelope, headers: {}, routingKey: 'video.uploaded' },
      context,
    );

    expect(events.publish).toHaveBeenCalledWith({
      eventType: 'video.failed',
      correlationId,
      payload: expect.objectContaining({
        videoId,
        ownerId,
        errorCode: 'FFMPEG_FAILED',
        attempts: 5,
      }),
    });
    expect(context.deadLetter).toHaveBeenCalledOnce();
    expect(context.retry).not.toHaveBeenCalled();
  });

  it('dead-letters poison envelopes without video.failed', async () => {
    const events: EventPublisher = { publish: vi.fn(async () => undefined) };
    const context = createContext(1);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: useCaseWith(async () => 'frames_packaged'),
      events,
      retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 },
      logger: silentLogger,
    });

    await consumer(
      {
        envelope: { ...uploadedEnvelope, eventType: 'not.a.real.event' },
        headers: {},
        routingKey: 'video.uploaded',
      },
      context,
    );

    expect(context.deadLetter).toHaveBeenCalledOnce();
    expect(events.publish).not.toHaveBeenCalled();
    expect(context.retry).not.toHaveBeenCalled();
  });

  it('runs the handler under runWithCorrelationId', async () => {
    let seen: string | undefined;
    const context = createContext(1);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: useCaseWith(async () => {
        seen = getCorrelationId();
        return 'frames_packaged';
      }),
      events: { publish: async () => undefined },
      retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 },
      logger: silentLogger,
    });

    await consumer(
      { envelope: uploadedEnvelope, headers: {}, routingKey: 'video.uploaded' },
      context,
    );
    expect(seen).toBe(correlationId);
  });

  it('treats a non-processing error as an unexpected retryable retry', async () => {
    const events: EventPublisher = { publish: vi.fn(async () => undefined) };
    const context = createContext(1);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: useCaseWith(async () => {
        throw new Error('socket hang up');
      }),
      events,
      retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 },
      logger: silentLogger,
    });

    await consumer(
      { envelope: uploadedEnvelope, headers: {}, routingKey: 'video.uploaded' },
      context,
    );

    expect(context.retry).toHaveBeenCalledOnce();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it('uses a fallback reason when exhaustion throws a non-error', async () => {
    const events: EventPublisher = { publish: vi.fn(async () => undefined) };
    const context = createContext(5);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: useCaseWith(async () => {
        // Exercises the branch where exhaustion does not carry an Error.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'offline';
      }),
      events,
      retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 },
      logger: silentLogger,
    });

    await consumer(
      { envelope: uploadedEnvelope, headers: {}, routingKey: 'video.uploaded' },
      context,
    );

    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'video.failed',
        payload: expect.objectContaining({
          errorCode: 'UNEXPECTED',
          reason: 'max attempts exhausted',
        }),
      }),
    );
    expect(context.deadLetter).toHaveBeenCalledOnce();
  });
});
