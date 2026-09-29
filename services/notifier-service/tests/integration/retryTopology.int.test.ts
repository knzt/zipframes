import { startRabbitMq } from '@zipframes/test-toolkit';
import type { RabbitMqHandle } from '@zipframes/test-toolkit';
import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CONTACTS_QUEUE,
  CONTACTS_RETRY_QUEUE,
  createNotifierAmqpTopology,
  EMAILS_QUEUE,
  EMAILS_RETRY_QUEUE,
  EVENT_EXCHANGE,
} from '../../src/infrastructure/messaging/amqplib/amqpTopology.js';
import {
  createRabbitMqConnection,
  type RabbitMqConnection,
} from '../../src/infrastructure/messaging/amqplib/connection.js';

const OTHER_SUBSCRIBER_QUEUE = 'test.other-subscriber.video.failed';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitForQueue = async (channel: Channel, queue: string): Promise<void> => {
  const deadline = Date.now() + 10_000;
  let back = await channel.checkQueue(queue);
  while (back.messageCount === 0 && Date.now() < deadline) {
    await sleep(100);
    back = await channel.checkQueue(queue);
  }
};

let rabbit: RabbitMqHandle;
let worker: RabbitMqConnection;
let connection: ChannelModel;
let channel: Channel;

beforeAll(async () => {
  rabbit = await startRabbitMq();
  worker = await createRabbitMqConnection(rabbit.amqpUri, 2);
  await worker.assertTopology(createNotifierAmqpTopology());

  connection = await amqp.connect(rabbit.amqpUri);
  channel = await connection.createChannel();
  await channel.assertQueue(OTHER_SUBSCRIBER_QUEUE, { durable: false });
  await channel.bindQueue(OTHER_SUBSCRIBER_QUEUE, EVENT_EXCHANGE, 'video.failed');
});

afterAll(async () => {
  await connection.close().catch(() => undefined);
  await worker.close();
  await rabbit.stop();
});

describe('the retry queues on a real broker', () => {
  it('returns an expired email retry to the emails queue only', async () => {
    channel.sendToQueue(EMAILS_RETRY_QUEUE, Buffer.from('{"retry":true}'), {
      expiration: '50',
      headers: { 'x-attempt': 2 },
    });

    await waitForQueue(channel, EMAILS_QUEUE);

    const returned = await channel.get(EMAILS_QUEUE, { noAck: true });
    expect(returned).not.toBe(false);
    if (returned === false) return;
    expect(returned.content.toString('utf8')).toBe('{"retry":true}');
    expect(returned.properties.headers?.['x-attempt']).toBe(2);
    expect((await channel.checkQueue(CONTACTS_QUEUE)).messageCount).toBe(0);
    expect((await channel.checkQueue(OTHER_SUBSCRIBER_QUEUE)).messageCount).toBe(0);
  });

  it('returns an expired contact retry to the contacts queue only', async () => {
    channel.sendToQueue(CONTACTS_RETRY_QUEUE, Buffer.from('{"contact-retry":true}'), {
      expiration: '50',
      headers: { 'x-attempt': 2 },
    });

    await waitForQueue(channel, CONTACTS_QUEUE);

    const returned = await channel.get(CONTACTS_QUEUE, { noAck: true });
    expect(returned).not.toBe(false);
    if (returned === false) return;
    expect(returned.content.toString('utf8')).toBe('{"contact-retry":true}');
    expect((await channel.checkQueue(EMAILS_QUEUE)).messageCount).toBe(0);
  });
});
