import type { ConsumeContext } from '@zipframes/communication';
import { createLogger } from '@zipframes/logger';
import { getCorrelationId } from '@zipframes/logger';
import { describe, expect, it, vi } from 'vitest';

import type { EventPublisher } from '../../src/application/gateways/event-publisher.js';
import { ProcessingError } from '../../src/domain/errors.js';
import { planAmqpSettle } from '../../src/infrastructure/messaging/amqp-settle.js';
import { UPLOADED_RETRY_QUEUE } from '../../src/infrastructure/messaging/topology.js';
import { createVideoUploadedConsumer } from '../../src/infrastructure/messaging/video-uploaded-consumer.js';

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

describe('planAmqpSettle (adapter settle ≠ DLQ on retry)', () => {
  const retry = { maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 30_000 };

  it('routes retry to the TTL wait queue with incremented attempt', () => {
    const plan = planAmqpSettle('retry', 2, retry);
    expect(plan).toEqual({
      kind: 'retry',
      waitQueue: UPLOADED_RETRY_QUEUE,
      nextAttempt: 3,
      delayMs: 2000,
    });
  });

  it('never plans nack/dlq for retry action', () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const plan = planAmqpSettle('retry', attempt, retry);
      expect(plan.kind).toBe('retry');
      if (plan.kind === 'retry') {
        expect(plan.waitQueue).toBe(UPLOADED_RETRY_QUEUE);
        expect(plan.waitQueue).not.toContain('dlq');
      }
    }
  });

  it('plans dlq only for explicit dlq action', () => {
    expect(planAmqpSettle('dlq', 5, retry)).toEqual({ kind: 'dlq' });
  });

  it('plans ack without touching the wait queue', () => {
    expect(planAmqpSettle('ack', 1, retry)).toEqual({ kind: 'ack' });
  });
});

describe('failure contract: video uploaded consumer', () => {
  it('acks after the use case rejects the media', async () => {
    const events: EventPublisher = { publish: vi.fn(async () => undefined) };
    const context = createContext(1);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: async () => 'media_rejected',
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

  it('retries transient failures without publishing video.failed', async () => {
    const events: EventPublisher = { publish: vi.fn(async () => undefined) };
    const context = createContext(1);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: async () => {
        throw new ProcessingError('transient', 'STORAGE_DOWNLOAD_FAILED', 'down');
      },
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
      processUploadedVideo: async () => {
        throw new ProcessingError('transient', 'FFMPEG_FAILED', 'busy');
      },
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
      processUploadedVideo: async () => 'frames_packaged',
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
      processUploadedVideo: async () => {
        seen = getCorrelationId();
        return 'frames_packaged';
      },
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

  it('treats a non-processing error as an unexpected transient retry', async () => {
    const events: EventPublisher = { publish: vi.fn(async () => undefined) };
    const context = createContext(1);
    const consumer = createVideoUploadedConsumer({
      processUploadedVideo: async () => {
        throw new Error('socket hang up');
      },
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
      processUploadedVideo: async () => {
        // Exercita o ramo em que o esgotamento não carrega um Error.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'offline';
      },
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
