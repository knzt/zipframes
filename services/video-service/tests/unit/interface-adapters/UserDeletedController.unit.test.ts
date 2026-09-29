import type { ConsumeContext } from '@zipframes/communication';
import { describe, expect, it, vi } from 'vitest';

import type { DeleteAccountVideosUseCase } from '../../../src/application/useCases/deleteAccountVideos/DeleteAccountVideosUseCase.js';
import { UserDeletedController } from '../../../src/interface-adapters/UserDeletedController.js';
import { CORRELATION_ID, OWNER_ID } from '../../support/videos.js';

const envelope = (
  eventType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> => ({
  eventId: '0194f3a0-0000-7000-8000-00000000e006',
  eventType,
  version: 1,
  occurredAt: '2026-09-27T12:00:00.000Z',
  correlationId: CORRELATION_ID,
  payload,
});

const contextFor = (attempt = 1): { context: ConsumeContext; settled: string[] } => {
  const settled: string[] = [];
  const context: ConsumeContext = {
    attempt,
    redelivered: attempt > 1,
    ack: () => Promise.resolve(void settled.push('ack')),
    retry: () => Promise.resolve(void settled.push('retry')),
    deadLetter: () => Promise.resolve(void settled.push('dlq')),
  };
  return { context, settled };
};

const controllerWith = (
  execute: DeleteAccountVideosUseCase['execute'],
  maxAttempts = 3,
): UserDeletedController =>
  new UserDeletedController({ execute } as unknown as DeleteAccountVideosUseCase, {
    retry: { maxAttempts, baseDelayMs: 1, maxDelayMs: 1 },
  });

describe('UserDeletedController', () => {
  it("purges the owner's videos and acks", async () => {
    const execute = vi.fn(() => Promise.resolve());
    const { context, settled } = contextFor();

    await controllerWith(execute).handle(
      {
        envelope: envelope('user.deleted', { userId: OWNER_ID }),
        headers: {},
        routingKey: 'user.deleted',
      },
      context,
    );

    expect(execute).toHaveBeenCalledWith(OWNER_ID);
    expect(settled).toEqual(['ack']);
  });

  it('dead-letters an envelope that does not match the schema', async () => {
    const execute = vi.fn();
    const { context, settled } = contextFor();

    await controllerWith(execute).handle(
      {
        envelope: envelope('user.deleted', { userId: 'not-a-uuid' }),
        headers: {},
        routingKey: 'user.deleted',
      },
      context,
    );

    expect(execute).not.toHaveBeenCalled();
    expect(settled).toEqual(['dlq']);
  });

  it('retries a failing attempt and dead-letters the last one', async () => {
    const execute = vi.fn(() => Promise.reject(new Error('storage down')));
    const message = {
      envelope: envelope('user.deleted', { userId: OWNER_ID }),
      headers: {},
      routingKey: 'user.deleted',
    };
    const first = contextFor(1);
    const last = contextFor(3);

    await controllerWith(execute).handle(message, first.context);
    await controllerWith(execute).handle(message, last.context);

    expect(first.settled).toEqual(['retry']);
    expect(last.settled).toEqual(['dlq']);
  });
});
