import { startRabbitMq } from '@zipframes/test-toolkit';
import type { RabbitMqHandle } from '@zipframes/test-toolkit';
import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createNotificationAmqpTopology,
  EVENT_EXCHANGE,
  NOTIFICATION_QUEUE,
  NOTIFICATION_RETRY_QUEUE,
} from '../../src/infrastructure/messaging/amqplib/amqpTopology.js';
import {
  createRabbitMqConnection,
  type RabbitMqConnection,
} from '../../src/infrastructure/messaging/amqplib/connection.js';

const OTHER_SUBSCRIBER_QUEUE = 'test.other-subscriber.video.failed';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let rabbit: RabbitMqHandle;
let worker: RabbitMqConnection;
let connection: ChannelModel;
let channel: Channel;

beforeAll(async () => {
  rabbit = await startRabbitMq();
  worker = await createRabbitMqConnection(rabbit.amqpUri, 1);
  await worker.assertTopology(createNotificationAmqpTopology());

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

describe('the retry queue on a real broker', () => {
  it('returns an expired retry to the notification queue only', async () => {
    channel.sendToQueue(NOTIFICATION_RETRY_QUEUE, Buffer.from('{"retry":true}'), {
      expiration: '50',
      headers: { 'x-attempt': 2 },
    });

    const deadline = Date.now() + 10_000;
    let back = await channel.checkQueue(NOTIFICATION_QUEUE);
    while (back.messageCount === 0 && Date.now() < deadline) {
      await sleep(100);
      back = await channel.checkQueue(NOTIFICATION_QUEUE);
    }

    const returned = await channel.get(NOTIFICATION_QUEUE, { noAck: true });
    expect(returned).not.toBe(false);
    if (returned === false) return;
    expect(returned.content.toString('utf8')).toBe('{"retry":true}');
    expect(returned.properties.headers?.['x-attempt']).toBe(2);
    expect((await channel.checkQueue(OTHER_SUBSCRIBER_QUEUE)).messageCount).toBe(0);
  });
});
