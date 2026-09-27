import type { BrokerMessage, ConsumeContext } from '@zipframes/communication';
import { ValidationError } from '@zipframes/core';
import { createLogger, getCorrelationId } from '@zipframes/logger';
import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';
import { describe, expect, it, vi } from 'vitest';

import {
  createVideoUploadedConsumer,
  type JobMetrics,
} from '../../../../../src/infrastructure/messaging/amqplib/videoUploadedConsumer.js';
import type {
  ProcessUploadedVideoController,
  ProcessUploadedVideoDecision,
} from '../../../../../src/interface-adapters/ProcessUploadedVideoController.js';

const ownerId = 'user-1';
const videoId = '11111111-1111-4111-8111-111111111111';
const correlationId = '22222222-2222-4222-8222-222222222222';

const event: VideoUploadedEvent = {
  eventId: '33333333-3333-4333-8333-333333333333',
  eventType: 'video.uploaded',
  version: 1,
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

const failure = { errorCode: 'FFMPEG_FAILED', retryable: true };

const silentLogger = createLogger({
  service: 'processor-worker-test',
  version: '0.0.0',
  level: 'error',
  destination: { write: () => undefined },
});

const createContext = (): ConsumeContext & {
  readonly ack: ReturnType<typeof vi.fn>;
  readonly retry: ReturnType<typeof vi.fn>;
  readonly deadLetter: ReturnType<typeof vi.fn>;
} => ({
  attempt: 1,
  redelivered: false,
  ack: vi.fn(async () => undefined),
  retry: vi.fn(async () => undefined),
  deadLetter: vi.fn(async () => undefined),
});

const createMetrics = (): { [K in keyof JobMetrics]: ReturnType<typeof vi.fn> } => ({
  recordFramesPackaged: vi.fn(),
  recordMediaRejected: vi.fn(),
  recordRetryScheduled: vi.fn(),
  recordRetriesExhausted: vi.fn(),
});

const run = async (
  decision: ProcessUploadedVideoDecision,
  envelope: BrokerMessage['envelope'] = event,
): Promise<{
  context: ReturnType<typeof createContext>;
  metrics: ReturnType<typeof createMetrics>;
  handle: ReturnType<typeof vi.fn>;
}> => {
  const context = createContext();
  const metrics = createMetrics();
  const handle = vi.fn(async () => decision);
  const consumer = createVideoUploadedConsumer({
    controller: { handle } as unknown as ProcessUploadedVideoController,
    logger: silentLogger,
    metrics,
  });

  await consumer({ envelope, headers: {}, routingKey: 'video.uploaded' }, context);

  return { context, metrics, handle };
};

describe('video uploaded consumer', () => {
  it('hands the raw envelope and attempt to the controller', async () => {
    const { handle } = await run({ action: 'ack', event, outcome: 'frames_packaged' });

    expect(handle).toHaveBeenCalledWith({ envelope: event, attempt: 1 });
  });

  it('acks and records packaged frames', async () => {
    const { context, metrics } = await run({ action: 'ack', event, outcome: 'frames_packaged' });

    expect(context.ack).toHaveBeenCalledOnce();
    expect(metrics.recordFramesPackaged).toHaveBeenCalledOnce();
    expect(context.retry).not.toHaveBeenCalled();
    expect(context.deadLetter).not.toHaveBeenCalled();
  });

  it('acks and records a rejected media', async () => {
    const { context, metrics } = await run({ action: 'ack', event, outcome: 'media_rejected' });

    expect(context.ack).toHaveBeenCalledOnce();
    expect(metrics.recordMediaRejected).toHaveBeenCalledOnce();
  });

  it('retries and records the scheduled retry', async () => {
    const { context, metrics } = await run({ action: 'retry', event, failure });

    expect(context.retry).toHaveBeenCalledOnce();
    expect(metrics.recordRetryScheduled).toHaveBeenCalledOnce();
    expect(context.ack).not.toHaveBeenCalled();
    expect(context.deadLetter).not.toHaveBeenCalled();
  });

  it('dead-letters and records exhausted retries', async () => {
    const { context, metrics } = await run({
      action: 'dead_letter',
      reason: 'retries_exhausted',
      event,
      failure,
    });

    expect(context.deadLetter).toHaveBeenCalledOnce();
    expect(metrics.recordRetriesExhausted).toHaveBeenCalledOnce();
    expect(context.retry).not.toHaveBeenCalled();
  });

  it('dead-letters a poison message without job metrics', async () => {
    const { context, metrics } = await run(
      {
        action: 'dead_letter',
        reason: 'poison',
        issues: new ValidationError('INVALID', 'bad envelope'),
      },
      'not-an-object' as unknown as BrokerMessage['envelope'],
    );

    expect(context.deadLetter).toHaveBeenCalledOnce();
    for (const record of Object.values(metrics)) {
      expect(record).not.toHaveBeenCalled();
    }
  });

  it('runs the controller under the envelope correlation id', async () => {
    let seen: string | undefined;
    const context = createContext();
    const consumer = createVideoUploadedConsumer({
      controller: {
        handle: async () => {
          seen = getCorrelationId();
          return { action: 'ack', event, outcome: 'frames_packaged' };
        },
      } as unknown as ProcessUploadedVideoController,
      logger: silentLogger,
    });

    await consumer({ envelope: event, headers: {}, routingKey: 'video.uploaded' }, context);

    expect(seen).toBe(correlationId);
  });

  it('runs without a correlation id when the envelope has none', async () => {
    let seen: string | undefined = 'unset';
    const context = createContext();
    const consumer = createVideoUploadedConsumer({
      controller: {
        handle: async () => {
          seen = getCorrelationId();
          return {
            action: 'dead_letter',
            reason: 'poison',
            issues: new ValidationError('INVALID', 'bad envelope'),
          };
        },
      } as unknown as ProcessUploadedVideoController,
      logger: silentLogger,
    });

    await consumer(
      {
        envelope: { correlationId: 42 } as unknown as BrokerMessage['envelope'],
        headers: {},
        routingKey: 'video.uploaded',
      },
      context,
    );

    expect(seen).toBeUndefined();
    expect(context.deadLetter).toHaveBeenCalledOnce();
  });
});
