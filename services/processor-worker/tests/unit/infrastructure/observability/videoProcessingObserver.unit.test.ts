import { UnavailableError, ValidationError } from '@zipframes/core';
import type { Logger } from '@zipframes/logger';
import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';
import { describe, expect, it, vi } from 'vitest';

import {
  createVideoProcessingObserver,
  type JobMetrics,
  type VideoProcessingOutcome,
} from '../../../../src/infrastructure/observability/videoProcessingObserver.js';

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

const video = { videoId: event.payload.videoId, ownerId: event.payload.ownerId, attempt: 2 };

const observe = (
  outcome: VideoProcessingOutcome,
  withMetrics = true,
): {
  logger: Record<'info' | 'warn' | 'error', ReturnType<typeof vi.fn>>;
  metrics: { [K in keyof JobMetrics]: ReturnType<typeof vi.fn> };
} => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const metrics = {
    recordFramesPackaged: vi.fn(),
    recordMediaRejected: vi.fn(),
    recordRetryScheduled: vi.fn(),
    recordRetriesExhausted: vi.fn(),
  };
  createVideoProcessingObserver({
    logger: logger as unknown as Logger,
    ...(withMetrics ? { metrics } : {}),
  })(outcome, { attempt: 2, durationMs: 1500 });
  return { logger, metrics };
};

describe('createVideoProcessingObserver', () => {
  it('logs a poison message without job metrics', () => {
    const error = new ValidationError('SCHEMA_VALIDATION_FAILED', 'bad envelope');

    const { logger, metrics } = observe({ kind: 'poison', error });

    expect(logger.warn).toHaveBeenCalledWith('poison video.uploaded message', {
      attempt: 2,
      issues: error,
    });
    for (const record of Object.values(metrics)) {
      expect(record).not.toHaveBeenCalled();
    }
  });

  it('records packaged frames', () => {
    const { logger, metrics } = observe({ kind: 'handled', event, result: 'frames_packaged' });

    expect(metrics.recordFramesPackaged).toHaveBeenCalledWith(1.5);
    expect(logger.info).toHaveBeenCalledWith('video processed', {
      ...video,
      originalFileName: 'clip.mp4',
      sizeBytes: 1024,
      processingResult: 'frames_packaged',
      durationMs: 1500,
    });
  });

  it('records a rejected media', () => {
    const { logger, metrics } = observe({ kind: 'handled', event, result: 'media_rejected' });

    expect(metrics.recordMediaRejected).toHaveBeenCalledWith(1.5);
    expect(logger.warn).toHaveBeenCalledWith('video processing rejected the media', {
      ...video,
      originalFileName: 'clip.mp4',
      processingResult: 'media_rejected',
      durationMs: 1500,
    });
  });

  it('records a scheduled retry with the error code', () => {
    const { logger, metrics } = observe({
      kind: 'retry',
      event,
      error: new UnavailableError('STORAGE_DOWNLOAD_FAILED', 'down'),
    });

    expect(metrics.recordRetryScheduled).toHaveBeenCalledWith(1.5);
    expect(logger.warn).toHaveBeenCalledWith(
      'video processing failed transiently; scheduling retry',
      {
        ...video,
        errorCode: 'STORAGE_DOWNLOAD_FAILED',
        retryable: true,
        processingResult: 'retry_scheduled',
        durationMs: 1500,
      },
    );
  });

  it('records exhausted retries, falling back to UNEXPECTED', () => {
    const { logger, metrics } = observe({ kind: 'exhausted', event, error: 'offline' });

    expect(metrics.recordRetriesExhausted).toHaveBeenCalledWith(1.5);
    expect(logger.error).toHaveBeenCalledWith('video processing exhausted retries', {
      ...video,
      errorCode: 'UNEXPECTED',
      retryable: true,
      processingResult: 'retries_exhausted',
      durationMs: 1500,
    });
  });

  it('still logs when no metrics are injected', () => {
    const { logger } = observe({ kind: 'handled', event, result: 'frames_packaged' }, false);

    expect(logger.info).toHaveBeenCalledOnce();
  });
});
