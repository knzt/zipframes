import { describe, expect, it, vi } from 'vitest';

import type { ConfirmChannel } from 'amqplib';

import { createAmqpPublishPort } from '../../../../src/infrastructure/messaging/amqpPublisher.js';

const envelope = {
  eventId: '44444444-4444-4444-8444-444444444444',
  eventType: 'user.registered' as const,
  version: 1 as const,
  occurredAt: '2026-09-20T12:00:05.000Z',
  correlationId: '22222222-2222-4222-8222-222222222222',
  payload: { userId: 'user-1' },
};

describe('createAmqpPublishPort', () => {
  it('resolves when the broker confirms the publish', async () => {
    const publish = vi.fn(
      (
        _exchange: string,
        _routingKey: string,
        _content: Buffer,
        _options: unknown,
        callback: (error?: Error) => void,
      ) => {
        callback();
        return true;
      },
    );
    const port = createAmqpPublishPort({ publish } as unknown as ConfirmChannel);

    await expect(
      port.publish(envelope, { exchange: 'zipframes.events', routingKey: 'user.registered' }),
    ).resolves.toBeUndefined();
    expect(publish).toHaveBeenCalledOnce();
  });

  it('rejects with the confirm error', async () => {
    const failure = new Error('nack');
    const publish = vi.fn(
      (
        _exchange: string,
        _routingKey: string,
        _content: Buffer,
        _options: unknown,
        callback: (error?: Error) => void,
      ) => {
        callback(failure);
        return true;
      },
    );
    const port = createAmqpPublishPort({ publish } as unknown as ConfirmChannel);

    await expect(
      port.publish(envelope, { exchange: 'zipframes.events', routingKey: 'user.registered' }),
    ).rejects.toBe(failure);
  });

  it('wraps a non-error confirm failure', async () => {
    const publish = vi.fn(
      (
        _exchange: string,
        _routingKey: string,
        _content: Buffer,
        _options: unknown,
        callback: (error?: Error) => void,
      ) => {
        callback('offline' as unknown as Error);
        return true;
      },
    );
    const port = createAmqpPublishPort({ publish } as unknown as ConfirmChannel);

    await expect(
      port.publish(envelope, { exchange: 'zipframes.events', routingKey: 'user.registered' }),
    ).rejects.toThrow('offline');
  });

  it('still waits for the confirm when the channel applies backpressure', async () => {
    const publish = vi.fn(
      (
        _exchange: string,
        _routingKey: string,
        _content: Buffer,
        _options: unknown,
        callback: (error?: Error) => void,
      ) => {
        callback();
        return false;
      },
    );
    const port = createAmqpPublishPort({ publish } as unknown as ConfirmChannel);

    await expect(
      port.publish(envelope, { exchange: 'zipframes.events', routingKey: 'user.registered' }),
    ).resolves.toBeUndefined();
  });
});
