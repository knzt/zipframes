import {
  CreateBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { startRabbitMq, startS3 } from '@zipframes/test-toolkit';
import type { RabbitMqHandle, S3Handle } from '@zipframes/test-toolkit';
import amqp, { type Channel, type GetMessage } from 'amqplib';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { framesPackageObjectKey } from '../../src/domain/policies/framesPackage.js';
import { S3ObjectStorageGateway } from '../../src/infrastructure/gateways/storage/s3ObjectStorage.gateway.js';
import { EVENT_EXCHANGE } from '../../src/infrastructure/messaging/amqplib/amqpTopology.js';
import { startWorker } from '../../src/main/start.js';
import { useBundledFfmpeg } from '../support/ffmpeg-bin.js';

const ownerId = 'user-1';
const videoId = '11111111-1111-4111-8111-111111111111';
const correlationId = '22222222-2222-4222-8222-222222222222';
const bucket = 'videos';

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

const renderClip = (destination: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=1:size=64x64:rate=1',
        '-pix_fmt',
        'yuv420p',
        destination,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer): void => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited ${String(code)}: ${stderr}`));
    });
  });

describe('processUploadedVideo message flow', () => {
  let rabbit: RabbitMqHandle;
  let objectStore: S3Handle;
  let client: S3Client;
  let clipPath = '';

  beforeAll(async () => {
    useBundledFfmpeg();
    const [startedRabbit, startedStore] = await Promise.all([startRabbitMq(), startS3()]);
    rabbit = startedRabbit;
    objectStore = startedStore;
    client = new S3Client({
      endpoint: startedStore.endpoint,
      region: startedStore.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: startedStore.accessKey,
        secretAccessKey: startedStore.secretKey,
      },
    });
    const bucketDeadline = Date.now() + 60_000;
    let bucketReady = false;
    while (Date.now() < bucketDeadline) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        bucketReady = true;
        break;
      } catch {
        await sleep(1000);
      }
    }
    if (!bucketReady) {
      throw new Error('object storage did not accept bucket creation');
    }
    const clipDir = await mkdtemp(path.join(tmpdir(), 'zf-clip-'));
    clipPath = path.join(clipDir, 'clip.mp4');
    await renderClip(clipPath);
  }, 180_000);

  afterAll(async () => {
    await rabbit.stop();
    await objectStore.stop();
  });

  it('packages frames for a video.uploaded message and deletes the source', async () => {
    const workDir = await mkdtemp(path.join(tmpdir(), 'zf-worker-'));
    const sourceKey = `uploads/${ownerId}/${videoId}`;
    const clip = await stat(clipPath);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: sourceKey,
        Body: await readFile(clipPath),
        ContentType: 'video/mp4',
      }),
    );

    process.env.AMQP_URL = rabbit.amqpUri;
    process.env.S3_ENDPOINT = objectStore.endpoint;
    process.env.S3_ACCESS_KEY = objectStore.accessKey;
    process.env.S3_SECRET_KEY = objectStore.secretKey;
    process.env.S3_REGION = objectStore.region;
    process.env.S3_BUCKET = bucket;
    process.env.S3_FORCE_PATH_STYLE = 'true';
    process.env.WORK_DIR = workDir;
    process.env.PROCESSING_TIMEOUT_MS = '60000';
    process.env.OPERATIONS_PORT = '0';
    process.env.MAX_ATTEMPTS = '3';
    process.env.RETRY_BASE_DELAY_MS = '1000';
    process.env.RETRY_MAX_DELAY_MS = '5000';
    process.env.LOG_LEVEL = 'info';
    process.env.SERVICE_VERSION = '0.0.0';

    const worker = await startWorker();
    try {
      const probe = await amqp.connect(rabbit.amqpUri);
      const channel = await probe.createChannel();
      const outcomes = await channel.assertQueue('', { exclusive: true });
      await channel.bindQueue(outcomes.queue, EVENT_EXCHANGE, 'video.processed');
      await channel.bindQueue(outcomes.queue, EVENT_EXCHANGE, 'video.failed');
      channel.publish(
        EVENT_EXCHANGE,
        'video.uploaded',
        Buffer.from(
          JSON.stringify({
            eventId: '33333333-3333-4333-8333-333333333333',
            eventType: 'video.uploaded',
            version: 1,
            occurredAt: '2026-09-22T12:00:00.000Z',
            correlationId,
            payload: {
              videoId,
              ownerId,
              sourceKey,
              originalFileName: 'clip.mp4',
              sizeBytes: clip.size,
            },
          }),
        ),
        { contentType: 'application/json', persistent: true },
      );

      const outcome = await pollQueue(channel, outcomes.queue);
      await channel.close();
      await probe.close();
      const body = outcome.content.toString('utf8');
      expect(body, body).toContain('"eventType":"video.processed"');

      const resultKey = framesPackageObjectKey(ownerId, videoId);
      await client.send(new HeadObjectCommand({ Bucket: bucket, Key: resultKey }));
      await expect(
        client.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceKey })),
      ).rejects.toThrow();
    } finally {
      await worker.stop();
    }
  });

  it('treats a missing source object as a permanent SOURCE_MISSING failure', async () => {
    const storage = new S3ObjectStorageGateway(client, bucket);
    const destination = path.join(tmpdir(), 'zf-missing-source.mp4');

    await expect(
      storage.downloadToFile(`uploads/${ownerId}/does-not-exist`, destination),
    ).rejects.toMatchObject({
      retryable: false,
      code: 'SOURCE_MISSING',
    });
  });
});
