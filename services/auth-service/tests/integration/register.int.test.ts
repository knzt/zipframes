import { randomUUID } from 'node:crypto';

import { createPublisher } from '@zipframes/communication';
import { authService } from '@zipframes/schemas';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';
import { startRabbitMq } from '@zipframes/test-toolkit';
import type { RabbitMqHandle } from '@zipframes/test-toolkit';
import amqp, { type Channel, type GetMessage } from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AmqpEventPublisher } from '../../src/infrastructure/gateways/amqpEventPublisher.gateway.js';
import { connectAmqp } from '../../src/infrastructure/messaging/amqpConnection.js';
import { createAmqpPublishPort } from '../../src/infrastructure/messaging/amqpPublisher.js';
import { startIdentityApp } from '../support/identity-app.js';
import type { IdentityApp } from '../support/identity-app.js';

const payload = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'senha1234',
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const pollQueue = async (channel: Channel, queue: string): Promise<GetMessage> => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const message = await channel.get(queue, { noAck: true });
    if (message) {
      return message;
    }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${queue}`);
};

describe('POST /register against Postgres and RabbitMQ', () => {
  let app: IdentityApp;
  let rabbit: RabbitMqHandle;
  let stopPublisher: () => Promise<void>;
  let probe: Awaited<ReturnType<typeof amqp.connect>>;
  let channel: Channel;
  let outcomesQueue: string;

  beforeAll(async () => {
    rabbit = await startRabbitMq();
    const amqpConnection = await connectAmqp(rabbit.amqpUri);
    await amqpConnection.channel.assertExchange(EVENT_EXCHANGE, 'topic', { durable: true });
    const eventPublisher = new AmqpEventPublisher({
      publisher: createPublisher(createAmqpPublishPort(amqpConnection.channel)),
      createId: () => randomUUID(),
      now: () => new Date(),
    });
    stopPublisher = async () => {
      await amqpConnection.close();
    };

    probe = await amqp.connect(rabbit.amqpUri);
    channel = await probe.createChannel();
    await channel.assertExchange(EVENT_EXCHANGE, 'topic', { durable: true });
    const outcomes = await channel.assertQueue('', { exclusive: true });
    outcomesQueue = outcomes.queue;
    await channel.bindQueue(outcomesQueue, EVENT_EXCHANGE, 'user.registered');

    app = await startIdentityApp({ eventPublisher });
  }, 180_000);

  afterAll(async () => {
    await app.stop();
    await stopPublisher();
    await channel.close();
    await probe.close();
    await rabbit.stop();
  });

  it('persists the user and publishes user.registered on the broker', async () => {
    const created = await fetch(`${app.baseUrl}/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': '33333333-3333-4333-8333-333333333333',
      },
      body: JSON.stringify(payload),
    });

    expect(created.status).toBe(201);
    const body = (await created.json()) as { userId: string; email: string; name: string };
    expect(body).toMatchObject({ name: payload.name, email: payload.email });

    const user = await app.prisma.user.findUnique({ where: { email: payload.email } });
    expect(user?.id).toBe(body.userId);

    const tables = await app.prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'
    `;
    expect(tables.map((row) => row.tablename)).toContain('users');
    expect(tables.map((row) => row.tablename)).not.toContain('outbox');

    const delivered = await pollQueue(channel, outcomesQueue);
    const envelope: unknown = JSON.parse(delivered.content.toString('utf8')) as unknown;
    const parsed = authService.userRegisteredEventSchema.safeParse(envelope);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data).toMatchObject({
      eventType: 'user.registered',
      version: 1,
      correlationId: '33333333-3333-4333-8333-333333333333',
      payload: {
        userId: body.userId,
        name: payload.name,
        email: payload.email,
      },
    });

    const duplicate = await fetch(`${app.baseUrl}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(duplicate.status).toBe(409);
    expect(await app.prisma.user.count()).toBe(1);
  });
});
