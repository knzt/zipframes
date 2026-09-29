import { randomUUID } from 'node:crypto';

import { HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';
import { videoService } from '@zipframes/schemas';
import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EVENT_EXCHANGE } from '../../src/infrastructure/messaging/amqplib/amqpTopology.js';
import {
  BUCKET,
  MAX_UPLOAD_BYTES,
  startVideoServiceUnderTest,
  type VideoServiceUnderTest,
} from '../support/video-service.js';

const UPLOADED_PROBE_QUEUE = 'test.video.uploaded';

let service: VideoServiceUnderTest;
let connection: ChannelModel;
/** Filled as each resource comes up, so a failed start still cleans what it opened. */
const cleanups: (() => Promise<void>)[] = [];
let channel: Channel;

beforeAll(async () => {
  service = await startVideoServiceUnderTest();
  cleanups.push(() => service.stop());
  connection = await amqp.connect(service.amqpUri);
  cleanups.push(() => connection.close());
  channel = await connection.createChannel();
  await channel.assertQueue(UPLOADED_PROBE_QUEUE, { durable: false });
  await channel.bindQueue(UPLOADED_PROBE_QUEUE, EVENT_EXCHANGE, 'video.uploaded');
});

afterAll(async () => {
  for (const cleanup of cleanups.reverse()) {
    await cleanup().catch(() => undefined);
  }
});

const call = async (method: string, pathname: string, ownerId: string): Promise<Response> =>
  fetch(`${service.url}${pathname}`, {
    method,
    headers: { authorization: `Bearer ${await service.tokenFor(ownerId)}` },
  });

/** `POST /videos` as a browser form would send it. */
const upload = async (
  ownerId: string,
  content: Buffer,
  fileName = 'aula.mp4',
  contentType = 'video/mp4',
): Promise<Response> => {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(content)], { type: contentType }), fileName);
  return fetch(`${service.url}/videos`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await service.tokenFor(ownerId)}` },
    body: form,
  });
};

const uploadVideo = async (ownerId: string, content = Buffer.alloc(2048, 7)): Promise<string> => {
  const response = await upload(ownerId, content);
  expect(response.status).toBe(201);
  return videoService.uploadVideoResponseSchema.parse(await response.json()).videoId;
};

/** Publishes on the broker the service consumes from, as the worker or auth-service would. */
const publishEvent = (eventType: string, payload: Record<string, unknown>): void => {
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

const reachStatus = (videoId: string, ownerId: string, status: string): Promise<string> =>
  eventually(
    () => statusOf(videoId, ownerId),
    (current) => current === status,
  );

/** Stores a package where the worker would and reports it as processed. */
const finishProcessing = async (videoId: string, ownerId: string, zip: Buffer): Promise<string> => {
  const resultKey = `outputs/${ownerId}/${videoId}.zip`;
  await service.s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: resultKey, Body: zip }));
  publishEvent('video.processed', { videoId, resultKey, frameCount: 3, durationMs: 50 });
  return resultKey;
};

const objectExists = async (key: string): Promise<boolean> =>
  service.s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })).then(
    () => true,
    () => false,
  );

describe('the life of a video', () => {
  const ownerId = randomUUID();
  const file = Buffer.alloc(2048, 7);
  let videoId: string;

  it('stores the uploaded file and tells the worker with video.uploaded', async () => {
    videoId = await uploadVideo(ownerId, file);

    expect(await statusOf(videoId, ownerId)).toBe('QUEUED');
    const sourceKey = `uploads/${ownerId}/${videoId}`;
    expect(await objectExists(sourceKey)).toBe(true);
    const message = await eventually(
      () => channel.get(UPLOADED_PROBE_QUEUE, { noAck: true }),
      (got) => got !== false,
    );
    if (message === false) throw new Error('video.uploaded was not published');
    const event = videoService.videoUploadedEventSchema.parse(
      JSON.parse(message.content.toString('utf8')),
    );
    expect(event.payload).toEqual({
      videoId,
      ownerId,
      sourceKey,
      originalFileName: 'aula.mp4',
      sizeBytes: file.length,
    });
  });

  it("follows the worker's events to DONE and hands out the package", async () => {
    const zip = Buffer.from('PK-frames');
    publishEvent('video.processing.started', { videoId, attempt: 1 });
    expect(await reachStatus(videoId, ownerId, 'PROCESSING')).toBe('PROCESSING');

    await finishProcessing(videoId, ownerId, zip);
    expect(await reachStatus(videoId, ownerId, 'DONE')).toBe('DONE');

    const response = await call('GET', `/videos/${videoId}/download`, ownerId);
    const { downloadUrl } = videoService.downloadResponseSchema.parse(await response.json());
    const download = await fetch(downloadUrl);

    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(zip);
    expect(download.headers.get('content-disposition')).toContain('aula-frames.zip');
  });

  it('ignores a late failure once the video is done', async () => {
    publishEvent('video.failed', {
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
    expect(await objectExists(`outputs/${ownerId}/${videoId}.zip`)).toBe(false);
    expect(await (await call('GET', '/videos', ownerId)).json()).toEqual({ items: [] });
  });
});

describe('uploads that break the rules', () => {
  it('answers 413 for a file above the limit and keeps nothing', async () => {
    const ownerId = randomUUID();

    const response = await upload(ownerId, Buffer.alloc(MAX_UPLOAD_BYTES + 1));

    expect(response.status).toBe(413);
    const stored = await service.s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `uploads/${ownerId}/` }),
    );
    expect(stored.KeyCount ?? 0).toBe(0);
    expect(await (await call('GET', '/videos', ownerId)).json()).toEqual({ items: [] });
  });

  it('answers 400 for a file that is not a video', async () => {
    const response = await upload(randomUUID(), Buffer.alloc(10), 'foto.png', 'image/png');

    expect(response.status).toBe(400);
  });

  it('answers 401 for a token the auth-service did not sign', async () => {
    const response = await fetch(`${service.url}/videos`, {
      headers: { authorization: 'Bearer forged' },
    });

    expect(response.status).toBe(401);
  });

  it('fails a video the worker could not process, with its reason', async () => {
    const ownerId = randomUUID();
    const videoId = await uploadVideo(ownerId);

    publishEvent('video.failed', {
      videoId,
      ownerId,
      errorCode: 'UNSUPPORTED_MEDIA',
      reason: 'ffmpeg rejected the media file',
      attempts: 1,
    });
    await reachStatus(videoId, ownerId, 'FAILED');

    expect(await (await call('GET', `/videos/${videoId}`, ownerId)).json()).toMatchObject({
      status: 'FAILED',
      failureReason: 'ffmpeg rejected the media file',
    });
  });
});

describe('account deletion', () => {
  it('removes every video and object of the owner on user.deleted, whatever their status', async () => {
    const ownerId = randomUUID();
    const doneVideoId = await uploadVideo(ownerId);
    const resultKey = await finishProcessing(doneVideoId, ownerId, Buffer.from('PK-frames'));
    await reachStatus(doneVideoId, ownerId, 'DONE');
    const queuedVideoId = await uploadVideo(ownerId);
    const sourceKey = `uploads/${ownerId}/${doneVideoId}`;
    const queuedSourceKey = `uploads/${ownerId}/${queuedVideoId}`;

    publishEvent('user.deleted', { userId: ownerId });

    await eventually(
      () => call('GET', `/videos/${doneVideoId}`, ownerId),
      (response) => response.status === 404,
    );
    expect((await call('GET', `/videos/${queuedVideoId}`, ownerId)).status).toBe(404);
    const listing = await call('GET', '/videos', ownerId);
    expect(listing.status).toBe(200);
    expect(await listing.json()).toEqual({ items: [] });
    expect(await objectExists(sourceKey)).toBe(false);
    expect(await objectExists(resultKey)).toBe(false);
    expect(await objectExists(queuedSourceKey)).toBe(false);
  });

  it('leaves other owners alone', async () => {
    const ownerId = randomUUID();
    const untouchedOwnerId = randomUUID();
    const videoId = await uploadVideo(ownerId);
    const untouchedVideoId = await uploadVideo(untouchedOwnerId);

    publishEvent('user.deleted', { userId: ownerId });

    await eventually(
      () => call('GET', `/videos/${videoId}`, ownerId),
      (response) => response.status === 404,
    );
    expect(await statusOf(untouchedVideoId, untouchedOwnerId)).toBe('QUEUED');
  });
});

describe('retention', () => {
  beforeAll(async () => {
    await service.restart({ RESULT_RETENTION_SECONDS: '1', EXPIRATION_SWEEP_INTERVAL_MS: '200' });
  });

  it('expires the package once its window ends and answers 410', async () => {
    const ownerId = randomUUID();
    const videoId = await uploadVideo(ownerId);
    const resultKey = await finishProcessing(videoId, ownerId, Buffer.from('PK-frames'));
    await reachStatus(videoId, ownerId, 'DONE');

    expect(await reachStatus(videoId, ownerId, 'EXPIRED')).toBe('EXPIRED');
    expect(await objectExists(resultKey)).toBe(false);
    expect((await call('GET', `/videos/${videoId}/download`, ownerId)).status).toBe(410);
  });
});
