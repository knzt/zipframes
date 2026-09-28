import { UnavailableError, ValidationError } from '@zipframes/core';
import { createMetrics } from '@zipframes/telemetry';
import { describe, expect, it, vi } from 'vitest';

import type { ProcessingStatusEvent } from '../../../../src/interface-adapters/ApplyProcessingEventController.js';
import { createProcessingStatusObserver } from '../../../../src/infrastructure/observability/processingStatusObserver.js';
import { CORRELATION_ID, VIDEO_ID } from '../../../support/videos.js';

const event: ProcessingStatusEvent = {
  eventId: '0194f3a0-0000-7000-8000-00000000e005',
  eventType: 'video.processing.started',
  version: 1,
  occurredAt: '2026-09-27T12:00:00.000Z',
  correlationId: CORRELATION_ID,
  payload: { videoId: VIDEO_ID, attempt: 1 },
};

interface FakeLogger {
  readonly debug: ReturnType<typeof vi.fn>;
  readonly info: ReturnType<typeof vi.fn>;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly error: ReturnType<typeof vi.fn>;
  readonly child: ReturnType<typeof vi.fn>;
}

const fakeLogger = (): FakeLogger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
});

const setup = (): {
  logger: FakeLogger;
  observe: ReturnType<typeof createProcessingStatusObserver>;
  count: (outcome: string) => Promise<number>;
} => {
  const logger = fakeLogger();
  const metrics = createMetrics({ service: 't', version: '0', collectDefaults: false });
  const observe = createProcessingStatusObserver({ logger, metrics });
  const count = async (outcome: string): Promise<number> =>
    (await metrics.messagesHandledTotal.get()).values.find(
      (value) => value.labels.outcome === outcome,
    )?.value ?? 0;
  return { logger, observe, count };
};

const ctx = { attempt: 2, durationMs: 40 };

describe('createProcessingStatusObserver', () => {
  it('logs and counts each kind of outcome', async () => {
    const { logger, observe, count } = setup();

    observe({ kind: 'handled', event, result: { kind: 'applied', status: 'PROCESSING' } }, ctx);
    observe(
      { kind: 'handled', event, result: { kind: 'ignored', reason: 'processing_finished' } },
      ctx,
    );
    observe({ kind: 'handled', event, result: { kind: 'unknown_video' } }, ctx);
    observe({ kind: 'retry', event, error: new UnavailableError('DB_DOWN', 'db down') }, ctx);
    observe({ kind: 'exhausted', event, error: 'weird' }, ctx);
    observe({ kind: 'poison', error: new ValidationError('SCHEMA_VALIDATION_FAILED', 'bad') }, ctx);

    for (const outcome of ['applied', 'ignored', 'unknown_video', 'retry', 'exhausted', 'poison']) {
      expect(await count(outcome)).toBe(1);
    }
    expect(logger.info).toHaveBeenCalledWith('processing status applied', {
      eventType: 'video.processing.started',
      videoId: VIDEO_ID,
      attempt: 2,
      durationMs: 40,
      status: 'PROCESSING',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'processing status failed; scheduling retry',
      expect.objectContaining({ errorCode: 'DB_DOWN' }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      'processing status exhausted retries',
      expect.objectContaining({ errorCode: 'UNEXPECTED' }),
    );
  });

  it('logs without metrics when none are given', () => {
    const logger = fakeLogger();
    const observe = createProcessingStatusObserver({ logger });

    observe({ kind: 'handled', event, result: { kind: 'unknown_video' } }, ctx);

    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
