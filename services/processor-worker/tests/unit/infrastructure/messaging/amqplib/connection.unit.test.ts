import { EventEmitter } from 'node:events';

import type { ConsumeHandler } from '@zipframes/communication';
import type { ChannelModel, ConsumeMessage } from 'amqplib';
import { describe, expect, it, vi } from 'vitest';

import {
  createAmqpPing,
  createRabbitMqConnection,
} from '../../../../../src/infrastructure/messaging/amqplib/connection.js';
import { createProcessorAmqpTopology } from '../../../../../src/infrastructure/messaging/amqplib/amqpTopology.js';

const retry = { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 };

const envelope = {
  eventId: '33333333-3333-4333-8333-333333333333',
  eventType: 'video.uploaded',
  version: 1,
  occurredAt: '2026-09-20T12:00:00.000Z',
  correlationId: '22222222-2222-4222-8222-222222222222',
  payload: { videoId: 'video-1' },
};

const consumeMessage = (overrides?: {
  readonly content?: Buffer;
  readonly headers?: Record<string, unknown>;
  readonly contentType?: string | number;
  readonly redelivered?: boolean;
}): ConsumeMessage =>
  ({
    content: overrides?.content ?? Buffer.from(JSON.stringify(envelope)),
    properties: {
      headers: overrides?.headers ?? {},
      contentType: overrides?.contentType ?? 'application/json',
    },
    fields: {
      routingKey: 'video.uploaded',
      redelivered: overrides?.redelivered ?? false,
      deliveryTag: 1,
      exchange: 'zipframes.events',
      consumerTag: 'ctag',
    },
  }) as ConsumeMessage;

interface FakeChannel {
  readonly prefetch: ReturnType<typeof vi.fn>;
  readonly assertExchange: ReturnType<typeof vi.fn>;
  readonly assertQueue: ReturnType<typeof vi.fn>;
  readonly bindQueue: ReturnType<typeof vi.fn>;
  readonly publish: ReturnType<typeof vi.fn>;
  readonly consume: ReturnType<typeof vi.fn>;
  readonly ack: ReturnType<typeof vi.fn>;
  readonly nack: ReturnType<typeof vi.fn>;
  readonly sendToQueue: ReturnType<typeof vi.fn>;
  readonly cancel: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly once: ReturnType<typeof vi.fn>;
  readonly emitDrain: () => void;
}

interface FakeBroker {
  readonly connect: () => Promise<ChannelModel>;
  readonly channel: FakeChannel;
  readonly connectionClose: ReturnType<typeof vi.fn>;
  readonly listeners: { close?: () => void; error?: () => void };
  deliver: (message: ConsumeMessage | null) => void;
}

const createFakeChannel = (): FakeChannel => {
  const drain = new EventEmitter();
  return {
    prefetch: vi.fn(async () => undefined),
    assertExchange: vi.fn(async () => undefined),
    assertQueue: vi.fn(async () => undefined),
    bindQueue: vi.fn(async () => undefined),
    publish: vi.fn(() => true),
    consume: vi.fn(),
    ack: vi.fn(),
    nack: vi.fn(),
    sendToQueue: vi.fn(),
    cancel: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    once: vi.fn((event: string, callback: () => void) => {
      drain.once(event, callback);
    }),
    emitDrain: () => {
      drain.emit('drain');
    },
  };
};

const createFakeBroker = (): FakeBroker => {
  const listeners: { close?: () => void; error?: () => void } = {};
  const channel = createFakeChannel();
  let onMessage: ((message: ConsumeMessage | null) => void) | undefined;
  channel.consume.mockImplementation(
    async (_queue: string, handler: (message: ConsumeMessage | null) => void) => {
      onMessage = handler;
      return { consumerTag: 'ctag' };
    },
  );
  const connectionClose = vi.fn(async () => undefined);
  const connection = {
    createChannel: vi.fn(async () => channel),
    on: vi.fn((event: 'close' | 'error', callback: () => void) => {
      listeners[event] = callback;
    }),
    close: connectionClose,
  };
  return {
    connect: async () => connection as unknown as ChannelModel,
    channel,
    connectionClose,
    listeners,
    deliver: (message) => {
      onMessage?.(message);
    },
  };
};

const ackHandler: ConsumeHandler = async (_message, context) => {
  await context.ack();
};

const retryHandler: ConsumeHandler = async (_message, context) => {
  await context.retry();
};

const dlqHandler: ConsumeHandler = async (_message, context) => {
  await context.deadLetter();
};

describe('createRabbitMqConnection', () => {
  it('acks a delivered message', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume('processor.video.uploaded', ackHandler, { retry });
    fake.deliver(consumeMessage());
    await vi.waitFor(() => {
      expect(fake.channel.ack).toHaveBeenCalledOnce();
    });
    expect(fake.channel.nack).not.toHaveBeenCalled();
    await connection.close();
  });

  it('acks when the handler does not settle', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume('processor.video.uploaded', async () => undefined, { retry });
    fake.deliver(consumeMessage());
    await vi.waitFor(() => {
      expect(fake.channel.ack).toHaveBeenCalledOnce();
    });
    await connection.close();
  });

  it('retries by publishing to the wait queue and acking the original', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume('processor.video.uploaded', retryHandler, { retry });
    fake.deliver(consumeMessage({ headers: { 'x-attempt': 2 } }));
    await vi.waitFor(() => {
      expect(fake.channel.sendToQueue).toHaveBeenCalledOnce();
    });
    expect(fake.channel.ack).toHaveBeenCalledOnce();
    expect(fake.channel.nack).not.toHaveBeenCalled();
    const sent = fake.channel.sendToQueue.mock.calls[0];
    expect(sent?.[0]).toBe('processor.video.uploaded.retry');
    expect(sent?.[2]).toMatchObject({
      expiration: expect.any(String),
      headers: expect.objectContaining({ 'x-attempt': 3 }),
    });
    await connection.close();
  });

  it('dead-letters with nack requeue false', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume('processor.video.uploaded', dlqHandler, { retry });
    fake.deliver(consumeMessage());
    await vi.waitFor(() => {
      expect(fake.channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });
    await connection.close();
  });

  it('dead-letters poison JSON', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume('processor.video.uploaded', ackHandler, { retry });
    fake.deliver(consumeMessage({ content: Buffer.from('{not-json') }));
    await vi.waitFor(() => {
      expect(fake.channel.nack).toHaveBeenCalledWith(expect.anything(), false, false);
    });
    await connection.close();
  });

  it('retries when the handler throws', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume(
      'processor.video.uploaded',
      async () => {
        throw new Error('boom');
      },
      { retry },
    );
    fake.deliver(consumeMessage());
    await vi.waitFor(() => {
      expect(fake.channel.sendToQueue).toHaveBeenCalledOnce();
    });
    await connection.close();
  });

  it('ignores a second settle on the same message', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume(
      'processor.video.uploaded',
      async (_message, context) => {
        await context.ack();
        await context.retry();
      },
      { retry },
    );
    fake.deliver(consumeMessage());
    await vi.waitFor(() => {
      expect(fake.channel.ack).toHaveBeenCalledOnce();
    });
    expect(fake.channel.sendToQueue).not.toHaveBeenCalled();
    await connection.close();
  });

  it('ignores a null delivery', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume('processor.video.uploaded', ackHandler, { retry });
    fake.deliver(null);
    await Promise.resolve();
    expect(fake.channel.ack).not.toHaveBeenCalled();
    expect(fake.channel.nack).not.toHaveBeenCalled();
    await connection.close();
  });

  it('requeues a delivery that arrives after close started', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume('processor.video.uploaded', ackHandler, { retry });
    const closing = connection.close();
    fake.deliver(consumeMessage());
    await closing;
    expect(fake.channel.nack).toHaveBeenCalledWith(expect.anything(), false, true);
  });

  it('waits for drain when publish returns false', async () => {
    const fake = createFakeBroker();
    fake.channel.publish.mockReturnValueOnce(false);
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    const published = connection.publish(envelope, {
      exchange: 'zipframes.events',
      routingKey: 'video.processed',
    });
    fake.channel.emitDrain();
    await published;
    expect(fake.channel.once).toHaveBeenCalledWith('drain', expect.any(Function));
    await connection.close();
  });

  it('asserts topology including dead-letter arguments', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.assertTopology(createProcessorAmqpTopology());
    expect(fake.channel.assertExchange).toHaveBeenCalled();
    expect(fake.channel.assertQueue).toHaveBeenCalledWith(
      'processor.video.uploaded',
      expect.objectContaining({
        arguments: {
          'x-dead-letter-exchange': 'zipframes.events.dlx',
          'x-dead-letter-routing-key': 'processor.video.uploaded',
        },
      }),
    );
    // The default exchange is the empty string; it must not be dropped as falsy.
    expect(fake.channel.assertQueue).toHaveBeenCalledWith(
      'processor.video.uploaded.retry',
      expect.objectContaining({
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': 'processor.video.uploaded',
        },
      }),
    );
    expect(fake.channel.bindQueue).toHaveBeenCalled();
    await connection.close();
  });

  it('treats a missing attempt header as 1 and copies non-null headers on retry', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume('processor.video.uploaded', retryHandler, { retry });
    fake.deliver(
      consumeMessage({
        headers: { keep: 'yes', drop: null },
        contentType: 1,
      }),
    );
    await vi.waitFor(() => {
      expect(fake.channel.sendToQueue).toHaveBeenCalledOnce();
    });
    expect(fake.channel.sendToQueue.mock.calls[0]?.[2]).toMatchObject({
      contentType: 'application/json',
      headers: { keep: 'yes', 'x-attempt': 2 },
    });
    await connection.close();
  });

  it('publishes without waiting for drain when the channel accepts the write', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.publish(envelope, {
      exchange: 'zipframes.events',
      routingKey: 'video.processed',
    });
    expect(fake.channel.publish).toHaveBeenCalledOnce();
    expect(fake.channel.once).not.toHaveBeenCalled();
    await connection.close();
  });

  it('marks disconnected on connection close and error', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    expect(connection.isConnected()).toBe(true);
    fake.listeners.close?.();
    expect(connection.isConnected()).toBe(false);
    await connection.close();
  });

  it('marks disconnected on connection error', async () => {
    const fake = createFakeBroker();
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    fake.listeners.error?.();
    expect(connection.isConnected()).toBe(false);
    await connection.close();
  });

  it('swallows close failures on an already closing channel', async () => {
    const fake = createFakeBroker();
    fake.channel.cancel.mockRejectedValueOnce(new Error('closing'));
    fake.channel.close.mockRejectedValueOnce(new Error('closing'));
    fake.connectionClose.mockRejectedValueOnce(new Error('closing'));
    const connection = await createRabbitMqConnection('amqp://localhost', fake.connect);
    await connection.consume('processor.video.uploaded', ackHandler, { retry });
    await expect(connection.close()).resolves.toBeUndefined();
  });
});

describe('createAmqpPing', () => {
  it('resolves while connected and rejects after disconnect', async () => {
    const pingable = createAmqpPing({ isConnected: () => true });
    await expect(pingable.ping()).resolves.toBeUndefined();
    const disconnected = createAmqpPing({ isConnected: () => false });
    await expect(disconnected.ping()).rejects.toThrow('amqp disconnected');
  });
});
