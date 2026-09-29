import { authService } from '@zipframes/schemas';
import amqp, { type Channel, type GetMessage } from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EVENT_EXCHANGE } from '../../src/infrastructure/messaging/amqplib/amqpTopology.js';
import { startAuthServiceUnderTest, type AuthServiceUnderTest } from '../support/auth-service.js';

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

describe('DELETE /account against Postgres and RabbitMQ', () => {
  let service: AuthServiceUnderTest;
  let probe: Awaited<ReturnType<typeof amqp.connect>>;
  let channel: Channel;
  let outcomesQueue: string;

  beforeAll(async () => {
    service = await startAuthServiceUnderTest();
    probe = await amqp.connect(service.amqpUri);
    channel = await probe.createChannel();
    await channel.assertExchange(EVENT_EXCHANGE, 'topic', { durable: true });
    const outcomes = await channel.assertQueue('', { exclusive: true });
    outcomesQueue = outcomes.queue;
    await channel.bindQueue(outcomesQueue, EVENT_EXCHANGE, 'user.deleted');
  }, 180_000);

  afterAll(async () => {
    await channel.close();
    await probe.close();
    await service.stop();
  });

  it('deletes the caller, publishes user.deleted, and still honours the old token', async () => {
    const created = await fetch(`${service.url}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const { userId } = (await created.json()) as { userId: string };

    const loggedIn = await fetch(`${service.url}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: payload.email, password: payload.password }),
    });
    const { accessToken } = (await loggedIn.json()) as { accessToken: string };

    const deleted = await fetch(`${service.url}/account`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'x-correlation-id': '44444444-4444-4444-8444-444444444444',
      },
    });
    expect(deleted.status).toBe(204);

    expect(await service.prisma.user.findUnique({ where: { id: userId } })).toBeNull();

    const delivered = await pollQueue(channel, outcomesQueue);
    const envelope: unknown = JSON.parse(delivered.content.toString('utf8')) as unknown;
    const parsed = authService.userDeletedEventSchema.safeParse(envelope);
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    expect(parsed.data).toMatchObject({
      eventType: 'user.deleted',
      version: 1,
      correlationId: '44444444-4444-4444-8444-444444444444',
      payload: { userId },
    });

    // The account is gone, but the token is a stateless signature and its
    // 15-minute expiry has not passed: it still verifies as that subject.
    // The next call downstream (video-service, notifier-service) has
    // nothing left of this owner to act on.
    const againWithSameToken = await fetch(`${service.url}/account`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(againWithSameToken.status).toBe(204);
  });

  it('answers 401 without a token', async () => {
    const response = await fetch(`${service.url}/account`, { method: 'DELETE' });

    expect(response.status).toBe(401);
  });
});
