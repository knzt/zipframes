import type { Logger } from '@zipframes/logger';
import { describe, expect, it, vi } from 'vitest';

import { createNotificationObserver } from '../../../../src/infrastructure/observability/notificationObserver.js';

const metrics = (): {
  readonly messagesHandledTotal: { readonly inc: ReturnType<typeof vi.fn> };
  readonly messageDurationSeconds: { readonly observe: ReturnType<typeof vi.fn> };
} => ({
  messagesHandledTotal: { inc: vi.fn() },
  messageDurationSeconds: { observe: vi.fn() },
});

describe('createNotificationObserver', () => {
  it('records handled, retry, exhausted and poison outcomes', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const technicalMetrics = metrics();
    const observe = createNotificationObserver({
      logger: logger as unknown as Logger,
      metrics: technicalMetrics as never,
    });

    observe({ kind: 'handled', event: {}, result: null }, { attempt: 1, durationMs: 10 });
    observe({ kind: 'retry', event: {}, error: new Error('smtp') }, { attempt: 2, durationMs: 10 });
    observe(
      { kind: 'exhausted', event: {}, error: new Error('smtp') },
      { attempt: 3, durationMs: 10 },
    );
    observe(
      { kind: 'poison', error: { code: 'INVALID', message: 'bad' } as never },
      { attempt: 1, durationMs: 5 },
    );

    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(technicalMetrics.messagesHandledTotal.inc).toHaveBeenCalledTimes(4);
  });
});
