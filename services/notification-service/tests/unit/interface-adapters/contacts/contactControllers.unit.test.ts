import type { ConsumeContext } from '@zipframes/communication';
import { describe, expect, it, vi } from 'vitest';

import { UserDeletedController } from '../../../../src/interface-adapters/contacts/UserDeletedController.js';
import { UserRegisteredController } from '../../../../src/interface-adapters/contacts/UserRegisteredController.js';
import { UserUpdatedController } from '../../../../src/interface-adapters/contacts/UserUpdatedController.js';

const retry = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 };

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

const envelope = {
  eventId: '33333333-3333-4333-8333-333333333333',
  version: 1 as const,
  occurredAt: '2026-09-28T12:00:00.000Z',
  correlationId: '22222222-2222-4222-8222-222222222222',
};

const userId = '33333333-3333-4333-8333-333333333333';

describe('identity controllers', () => {
  it('upserts a contact from user.registered', async () => {
    const execute = vi.fn(async () => undefined);
    const controller = new UserRegisteredController({ execute } as never, { retry });
    const context = contextAt(1);

    await controller.handle(
      {
        envelope: {
          ...envelope,
          eventType: 'user.registered',
          payload: { userId, name: 'Ada', email: 'ada@example.com' },
        },
        headers: {},
        routingKey: 'user.registered',
      },
      context,
    );

    expect(execute).toHaveBeenCalledWith({
      userId,
      name: 'Ada',
      email: 'ada@example.com',
      occurredAt: new Date('2026-09-28T12:00:00.000Z'),
    });
    expect(context.ack).toHaveBeenCalledOnce();
  });

  it('upserts a contact from user.updated', async () => {
    const execute = vi.fn(async () => undefined);
    const controller = new UserUpdatedController({ execute } as never, { retry });
    await controller.handle(
      {
        envelope: {
          ...envelope,
          eventType: 'user.updated',
          payload: { userId, name: 'Ada L', email: 'ada@new.example' },
        },
        headers: {},
        routingKey: 'user.updated',
      },
      contextAt(1),
    );
    expect(execute).toHaveBeenCalledWith({
      userId,
      name: 'Ada L',
      email: 'ada@new.example',
      occurredAt: new Date('2026-09-28T12:00:00.000Z'),
    });
  });

  it('deletes a contact from user.deleted', async () => {
    const execute = vi.fn(async () => undefined);
    const controller = new UserDeletedController({ execute } as never, { retry });
    await controller.handle(
      {
        envelope: { ...envelope, eventType: 'user.deleted', payload: { userId } },
        headers: {},
        routingKey: 'user.deleted',
      },
      contextAt(1),
    );
    expect(execute).toHaveBeenCalledWith(userId);
  });
});
