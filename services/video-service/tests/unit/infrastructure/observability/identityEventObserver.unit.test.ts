import { UnavailableError, ValidationError } from '@zipframes/core';
import type { UserDeletedEvent } from '@zipframes/schemas/auth-service';
import { describe, expect, it, vi } from 'vitest';

import { createIdentityEventObserver } from '../../../../src/infrastructure/observability/identityEventObserver.js';
import { OWNER_ID } from '../../../support/videos.js';

const event: UserDeletedEvent = {
  eventId: '0194f3a0-0000-7000-8000-00000000e006',
  eventType: 'user.deleted',
  version: 1,
  occurredAt: '2026-09-27T12:00:00.000Z',
  correlationId: '0194f3a0-0000-7000-8000-00000000d004',
  payload: { userId: OWNER_ID },
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

const ctx = { attempt: 2, durationMs: 40 };

describe('createIdentityEventObserver', () => {
  it('logs each kind of outcome, with the owner id and never the cause of a poison message', () => {
    const logger = fakeLogger();
    const observe = createIdentityEventObserver({ logger });

    observe({ kind: 'handled', event, result: undefined }, ctx);
    observe({ kind: 'retry', event, error: new UnavailableError('S3_DOWN', 'storage down') }, ctx);
    observe({ kind: 'exhausted', event, error: 'weird' }, ctx);
    observe({ kind: 'poison', error: new ValidationError('SCHEMA_VALIDATION_FAILED', 'bad') }, ctx);

    expect(logger.info).toHaveBeenCalledWith('account videos deleted', {
      userId: OWNER_ID,
      attempt: 2,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'account video deletion failed; scheduling retry',
      expect.objectContaining({ userId: OWNER_ID, errorCode: 'S3_DOWN' }),
    );
    expect(logger.error).toHaveBeenCalledWith(
      'account video deletion exhausted retries',
      expect.objectContaining({ userId: OWNER_ID, errorCode: 'UNEXPECTED' }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'poison user.deleted message',
      expect.objectContaining({ attempt: 2 }),
    );
  });
});
