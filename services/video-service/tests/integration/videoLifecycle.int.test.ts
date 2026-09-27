import { randomUUID } from 'node:crypto';

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { videoService } from '@zipframes/schemas';
import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CONCURRENT_VIDEO_UPDATE } from '../../src/application/interfaces/repositories/VideoRepository.js';
import { EVENT_EXCHANGE } from '../../src/infrastructure/messaging/amqplib/amqpTopology.js';
import { PrismaVideoRepository } from '../../src/infrastructure/repositories/prisma/video.repository.js';
import { aVideo } from '../support/videos.js';
import { BUCKET, MAX_UPLOAD_BYTES, startVideoApp, type VideoApp } from '../support/video-app.js';

const UPLOADED_PROBE_QUEUE = 'test.video.uploaded';

let app: VideoApp;
let connection: ChannelModel;
let channel: Channel;

beforeAll(async () => {
  app = await startVideoApp();
  connection = await amqp.connect(app.amqpUri);
  channel = await connection.createChannel();
  await channel.assertQueue(UPLOADED_PROBE_QUEUE, { durable: false });
  await channel.bindQueue(UPLOADED_PROBE_QUEUE, EVENT_EXCHANGE, 'video.uploaded');
});

afterAll(async () => {
  await connection.close().catch(() => undefined);
  await app.stop();
});

const call = async (
  method: string,
  pathname: string,
  ownerId: string,
  body?: unknown,
): Promise<Response> =>
  fetch(`${app.baseUrl}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${await app.tokenFor(ownerId)}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const publishWorkerEvent = (eventType: string, payload: Record<string, unknown>): void => {
  channel.publish(
    EVENT_EXCHANGE,
    eventType,
    Buffer.from(
      JSON.stringify({
        eventId: randomUUID(),
        eventType,
        version: 1,
        occurredAt: new Date().toISOString(),
        correlationId: randomUUID(),
        payload,
      }),
    ),
    { contentType: 'application/json' },
  );
};

const eventually = async <T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> => {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};

const statusOf = async (videoId: string, ownerId: string): Promise<string> => {
  const response = await call('GET', `/videos/${videoId}`, ownerId);
  return videoService.videoListItemSchema.parse(await response.json()).status;
};

describe('the life of a video', () => {
  const ownerId = randomUUID();
  const file = Buffer.alloc(2048, 7);
  let videoId: string;

  it('opens the video and returns a URL the file goes to directly', async () => {
    const response = await call('POST', '/videos', ownerId, {
      originalFileName: 'aula.mp4',
      contentType: 'video/mp4',
      sizeBytes: file.length,
    });
    expect(response.status).toBe(201);
    const upload = videoService.requestUploadResponseSchema.parse(await response.json());
    videoId = upload.videoId;

    const put = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'video/mp4' },
      body: file,
    });

    expect(put.ok).toBe(true);
    expect(await statusOf(videoId, ownerId)).toBe('AWAITING_UPLOAD');
  });

  it('queues the video and publishes video.uploaded for the worker', async () => {
    const response = await call('POST', `/videos/${videoId}/confirm`, ownerId);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ videoId, status: 'QUEUED' });
    const message = await eventually(
      () => channel.get(UPLOADED_PROBE_QUEUE, { noAck: true }),
      (got) => got !== false,
    );
    expect(message).not.toBe(false);
    if (message === false) return;
    const event = videoService.videoUploadedEventSchema.parse(
      JSON.parse(message.content.toString('utf8')),
    );
    expect(event.payload).toEqual({
      videoId,
      ownerId,
      sourceKey: `uploads/${ownerId}/${videoId}`,
      originalFileName: 'aula.mp4',
      sizeBytes: file.length,
    });
  });

  it('refuses a second confirmation', async () => {
    expect((await call('POST', `/videos/${videoId}/confirm`, ownerId)).status).toBe(409);
  });

  it("follows the worker's events to DONE and hands out the package", async () => {
    const resultKey = `outputs/${ownerId}/${videoId}.zip`;
    const zip = Buffer.from('PK-frames');
    await app.s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: resultKey, Body: zip }));

    publishWorkerEvent('video.processing.started', { videoId, attempt: 1 });
    await eventually(
      () => statusOf(videoId, ownerId),
      (status) => status === 'PROCESSING',
    );
    publishWorkerEvent('video.processed', { videoId, resultKey, frameCount: 3, durationMs: 50 });
    expect(
      await eventually(
        () => statusOf(videoId, ownerId),
        (s) => s === 'DONE',
      ),
    ).toBe('DONE');

    const response = await call('GET', `/videos/${videoId}/download`, ownerId);
    const { downloadUrl } = videoService.downloadResponseSchema.parse(await response.json());
    const download = await fetch(downloadUrl);

    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(zip);
    expect(download.headers.get('content-disposition')).toContain('aula-frames.zip');
  });

  it('ignores a late failure once the video is done', async () => {
    publishWorkerEvent('video.failed', {
      videoId,
      ownerId,
      errorCode: 'LATE',
      reason: 'late duplicate',
      attempts: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(await statusOf(videoId, ownerId)).toBe('DONE');
  });

  it('lists the video to its owner only', async () => {
    const mine = await (await call('GET', '/videos', ownerId)).json();
    const theirs = await (await call('GET', '/videos', randomUUID())).json();

    expect(videoService.listVideosResponseSchema.parse(mine).items.map((v) => v.videoId)).toEqual([
      videoId,
    ]);
    expect(theirs).toEqual({ items: [] });
    expect((await call('GET', `/videos/${videoId}`, randomUUID())).status).toBe(404);
  });

  it('deletes the files at the owner request and answers 410 afterwards', async () => {
    expect((await call('DELETE', `/videos/${videoId}`, ownerId)).status).toBe(204);

    expect((await call('GET', `/videos/${videoId}/download`, ownerId)).status).toBe(410);
    const listed = await (await call('GET', '/videos', ownerId)).json();
    expect(listed).toEqual({ items: [] });
  });
});

describe('uploads that break the rules', () => {
  it('rejects a declared size above the limit before signing anything', async () => {
    const response = await call('POST', '/videos', randomUUID(), {
      originalFileName: 'aula.mp4',
      contentType: 'video/mp4',
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });

    expect(response.status).toBe(400);
  });

  it('lets the storage refuse a body whose size differs from the declared one', async () => {
    const created = await call('POST', '/videos', randomUUID(), {
      originalFileName: 'aula.mkv',
      contentType: 'video/x-matroska',
      sizeBytes: 100,
    });
    const { uploadUrl } = videoService.requestUploadResponseSchema.parse(await created.json());

    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'video/x-matroska' },
      body: Buffer.alloc(5000),
    });

    expect(put.ok).toBe(false);
  });

  it('answers 409 when confirming before the file is uploaded', async () => {
    const ownerId = randomUUID();
    const created = await call('POST', '/videos', ownerId, {
      originalFileName: 'aula.webm',
      contentType: 'video/webm',
      sizeBytes: 10,
    });
    const { videoId } = videoService.requestUploadResponseSchema.parse(await created.json());

    expect((await call('POST', `/videos/${videoId}/confirm`, ownerId)).status).toBe(409);
  });

  it('fails a video the worker could not process, with its reason', async () => {
    const ownerId = randomUUID();
    const created = await call('POST', '/videos', ownerId, {
      originalFileName: 'quebrado.avi',
      contentType: 'video/x-msvideo',
      sizeBytes: 4,
    });
    const upload = videoService.requestUploadResponseSchema.parse(await created.json());
    await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'video/x-msvideo' },
      body: Buffer.from('nope'),
    });
    await call('POST', `/videos/${upload.videoId}/confirm`, ownerId);

    publishWorkerEvent('video.failed', {
      videoId: upload.videoId,
      ownerId,
      errorCode: 'UNSUPPORTED_MEDIA',
      reason: 'ffmpeg rejected the media file',
      attempts: 1,
    });
    await eventually(
      () => statusOf(upload.videoId, ownerId),
      (status) => status === 'FAILED',
    );
    const video = await (await call('GET', `/videos/${upload.videoId}`, ownerId)).json();

    expect(video).toMatchObject({
      status: 'FAILED',
      failureReason: 'ffmpeg rejected the media file',
    });
  });
});

describe('PrismaVideoRepository against Postgres', () => {
  it('lets only one of two writers based on the same read win', async () => {
    const repository = new PrismaVideoRepository(app.prisma);
    const video = aVideo('AWAITING_UPLOAD', { id: randomUUID(), ownerId: randomUUID() });
    await repository.create(video);
    const confirmed = video.confirmUpload({
      storedObject: { sizeBytes: 1024 },
      maxSizeBytes: MAX_UPLOAD_BYTES,
      now: new Date(),
    });
    if (!confirmed.ok) throw confirmed.error;

    await repository.save(confirmed.value);

    await expect(repository.save(confirmed.value)).rejects.toMatchObject({
      code: CONCURRENT_VIDEO_UPDATE,
    });
    expect((await repository.findById(video.id))?.version).toBe(1);
  });

  it('finds DONE videos whose window ended, and nothing else', async () => {
    const repository = new PrismaVideoRepository(app.prisma);
    const ownerId = randomUUID();
    const expiredId = randomUUID();
    const expired = aVideo('DONE', {
      id: expiredId,
      ownerId,
      resultKey: `outputs/${ownerId}/${expiredId}.zip`,
      expiresAt: new Date(Date.now() - 1000),
    });
    const freshId = randomUUID();
    const fresh = aVideo('DONE', {
      id: freshId,
      ownerId,
      resultKey: `outputs/${ownerId}/${freshId}.zip`,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await repository.create(expired);
    await repository.create(fresh);

    const found = await repository.findExpired(new Date(), 100);

    expect(found.map((video) => video.id)).toContain(expiredId);
    expect(found.map((video) => video.id)).not.toContain(freshId);
  });

  it('refuses a row that breaks an invariant, whatever the write path', async () => {
    const id = randomUUID();

    await expect(
      app.prisma.video.create({
        data: {
          ...aVideo('DONE', { id, ownerId: randomUUID() }).toJSON(),
          sizeBytes: 10n,
          resultKey: null,
        },
      }),
    ).rejects.toThrow(/ck_videos_done/u);
  });
});
