import type { Logger } from '@zipframes/logger';
import { describe, expect, it, vi } from 'vitest';

import { recordNotificationOutcome } from '../../../../src/infrastructure/observability/notificationOutcome.js';

const metrics = (): {
  readonly messagesHandledTotal: { readonly inc: ReturnType<typeof vi.fn> };
  readonly messageDurationSeconds: { readonly observe: ReturnType<typeof vi.fn> };
} => ({
  messagesHandledTotal: { inc: vi.fn() },
  messageDurationSeconds: { observe: vi.fn() },
});

describe('recordNotificationOutcome', () => {
  it('records handled, retry, exhausted and poison outcomes', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const technicalMetrics = metrics();
    const record = recordNotificationOutcome({
      logger: logger as unknown as Logger,
      metrics: technicalMetrics as never,
      destination: 'notification-service.emails',
    });

    record({ kind: 'handled', event: {}, result: null }, { attempt: 1, durationMs: 10 });
    record({ kind: 'retry', event: {}, error: new Error('smtp') }, { attempt: 2, durationMs: 10 });
    record(
      { kind: 'exhausted', event: {}, error: new Error('smtp') },
      { attempt: 3, durationMs: 10 },
    );
    record(
      { kind: 'poison', error: { code: 'INVALID', message: 'bad' } as never },
      { attempt: 1, durationMs: 5 },
    );

    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledOnce();
    expect(technicalMetrics.messagesHandledTotal.inc).toHaveBeenCalledTimes(4);
    expect(technicalMetrics.messagesHandledTotal.inc).toHaveBeenCalledWith({
      destination: 'notification-service.emails',
      outcome: 'handled',
    });
  });
});
