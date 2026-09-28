import { randomUUID } from 'node:crypto';

import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EVENT_EXCHANGE } from '../../src/infrastructure/messaging/amqplib/amqpTopology.js';
import {
  pollMailpit,
  putZipObject,
  startNotificationServiceUnderTest,
  type NotificationServiceUnderTest,
} from '../support/notification-service.js';

const userId = '33333333-3333-4333-8333-333333333333';
const videoId = '11111111-1111-4111-8111-111111111111';
const correlationId = '22222222-2222-4222-8222-222222222222';
const resultKey = `outputs/${userId}/${videoId}.zip`;

const envelope = (
  eventType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> => ({
  eventId: randomUUID(),
  eventType,
  version: 1,
  occurredAt: '2026-09-28T12:00:00.000Z',
  correlationId,
  payload,
});

const publish = async (
  channel: Channel,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  channel.publish(
    EVENT_EXCHANGE,
    eventType,
    Buffer.from(JSON.stringify(envelope(eventType, payload))),
    {
      persistent: true,
      contentType: 'application/json',
    },
  );
};

describe('notification-service message flow', () => {
  let service: NotificationServiceUnderTest;
  let connection: ChannelModel;
  let channel: Channel;

  beforeAll(async () => {
    service = await startNotificationServiceUnderTest();
    connection = await amqp.connect(service.amqpUri);
    channel = await connection.createChannel();
    await putZipObject(service.s3, resultKey);
  }, 180_000);

  afterAll(async () => {
    await channel.close().catch(() => undefined);
    await connection.close().catch(() => undefined);
    await service.stop();
  });

  it('sends a processed mail with a working signed GET and the download fallback', async () => {
    await publish(channel, 'user.registered', {
      userId,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    await publish(channel, 'video.processed', {
      videoId,
      ownerId: userId,
      originalFileName: 'clip.mp4',
      resultKey,
      frameCount: 8,
      durationMs: 1500,
    });

    const mail = await pollMailpit(service.mailpitApiUrl, 'clip.mp4');
    expect(mail.Subject).toContain('clip.mp4');
    expect(mail.Text).toContain(`http://localhost:3001/videos/${videoId}/download`);

    const signedUrl = mail.Text.split('\n').find(
      (line) => line.startsWith('http') && line.includes('X-Amz'),
    );
    expect(signedUrl).toBeDefined();
    const download = await fetch(signedUrl ?? '');
    expect(download.ok).toBe(true);

    const row = await service.prisma.notification.findFirst({
      where: { videoId, type: 'VIDEO_PROCESSED' },
    });
    expect(row?.status).toBe('SENT');
    expect(row?.target).toBe('ada@example.com');
  });

  it('keeps VIDEO_FAILED pending until the contact arrives, then sends without a content link', async () => {
    const failedVideoId = '55555555-5555-4555-8555-555555555555';
    const pendingUserId = '77777777-7777-4777-8777-777777777777';
    await publish(channel, 'video.failed', {
      videoId: failedVideoId,
      ownerId: pendingUserId,
      originalFileName: 'bad.mp4',
      errorCode: 'NO_FRAMES',
      reason: 'no frames extracted',
      attempts: 1,
    });

    const deadline = Date.now() + 10_000;
    let pending = await service.prisma.notification.findFirst({
      where: { videoId: failedVideoId, type: 'VIDEO_FAILED' },
    });
    while (pending === null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      pending = await service.prisma.notification.findFirst({
        where: { videoId: failedVideoId, type: 'VIDEO_FAILED' },
      });
    }
    expect(pending?.status).toBe('PENDING');

    await publish(channel, 'user.registered', {
      userId: pendingUserId,
      name: 'Ada Lovelace',
      email: 'ada-pending@example.com',
    });

    const mail = await pollMailpit(service.mailpitApiUrl, 'bad.mp4');
    expect(mail.Text).toContain('no frames extracted');
    expect(mail.Text).not.toContain('/videos/');
  });

  it('removes the contact and history on user.deleted', async () => {
    const deletedUser = '66666666-6666-4666-8666-666666666666';
    await publish(channel, 'user.registered', {
      userId: deletedUser,
      name: 'Temp',
      email: 'temp@example.com',
    });
    const waitUntil = Date.now() + 10_000;
    let contact = await service.prisma.contact.findUnique({ where: { userId: deletedUser } });
    while (contact === null && Date.now() < waitUntil) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      contact = await service.prisma.contact.findUnique({ where: { userId: deletedUser } });
    }
    expect(contact).not.toBeNull();

    await publish(channel, 'user.deleted', { userId: deletedUser });
    const goneDeadline = Date.now() + 10_000;
    let gone = await service.prisma.contact.findUnique({ where: { userId: deletedUser } });
    while (gone !== null && Date.now() < goneDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      gone = await service.prisma.contact.findUnique({ where: { userId: deletedUser } });
    }
    expect(gone).toBeNull();
  });
});
