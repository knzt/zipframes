import { CreateBucketCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { startRabbitMq } from '@zipframes/test-toolkit';
import type { RabbitMqHandle } from '@zipframes/test-toolkit';
import amqp, { type Channel, type GetMessage } from 'amqplib';
import { GenericContainer, Wait } from 'testcontainers';
import { spawn } from 'node:child_process';
import { mkdtemp, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { framesPackageObjectKey } from '../../src/domain/frames-package.js';
import { createFfmpegFrameExtractor } from '../../src/infrastructure/gateways/ffmpeg-frame-extractor.js';
import { createS3ObjectStorage } from '../../src/infrastructure/gateways/s3-object-storage.js';
import {
  createProcessorTopology,
  DLQ_QUEUE,
  EVENT_EXCHANGE,
  UPLOADED_QUEUE,
  UPLOADED_RETRY_QUEUE,
} from '../../src/infrastructure/messaging/topology.js';
import { createRabbitMqConnection } from '../../src/infrastructure/messaging/rabbitmq-connection.js';
import { startWorker } from '../../src/main/compose.js';
import { useBundledFfmpeg } from './ffmpeg-bin.js';

const ownerId = 'user-1';
const videoId = '11111111-1111-4111-8111-111111111111';
const correlationId = '22222222-2222-4222-8222-222222222222';
const bucket = 'videos';

const accessKey = 'zipframes';
const secretKey = 'zipframes-local-secret';
const region = 'us-east-1';

interface ObjectStoreHandle {
  readonly endpoint: string;
  readonly stop: () => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const startSeaweed = async (): Promise<ObjectStoreHandle> => {
  const container = await new GenericContainer('chrislusf/seaweedfs:3.80')
    .withCopyContentToContainer([
      {
        content: JSON.stringify({
          identities: [
            {
              name: 'zipframes',
              credentials: [{ accessKey, secretKey }],
              actions: ['Admin', 'Read', 'Write', 'List', 'Tagging'],
            },
          ],
        }),
        target: '/etc/seaweedfs/s3.json',
      },
    ])
    .withCommand([
      'server',
      '-dir=/data',
      '-filer',
      '-s3',
      '-s3.config=/etc/seaweedfs/s3.json',
      '-s3.port=8333',
    ])
    .withExposedPorts(8333)
    .withWaitStrategy(Wait.forListeningPorts())
    .withStartupTimeout(90_000)
    .start();

  return {
    endpoint: `http://${container.getHost()}:${String(container.getMappedPort(8333))}`,
    stop: async () => {
      await container.stop();
    },
  };
};

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

const uploadedEnvelope = (
  sourceKey: string,
  sizeBytes: number,
): {
  readonly eventId: string;
  readonly eventType: 'video.uploaded';
  readonly version: 1;
  readonly occurredAt: string;
  readonly correlationId: string;
  readonly payload: {
    readonly videoId: string;
    readonly ownerId: string;
    readonly sourceKey: string;
    readonly originalFileName: string;
    readonly sizeBytes: number;
  };
} => ({
  eventId: '33333333-3333-4333-8333-333333333333',
  eventType: 'video.uploaded' as const,
  version: 1 as const,
  occurredAt: '2026-09-22T12:00:00.000Z',
  correlationId,
  payload: {
    videoId,
    ownerId,
    sourceKey,
    originalFileName: 'clip.mp4',
    sizeBytes,
  },
});

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

describe('processor runtime against RabbitMQ and S3', () => {
  let rabbit: RabbitMqHandle | undefined;
  let objectStore: ObjectStoreHandle | undefined;
  let endpoint = '';
  let amqpUri = '';
  let clipPath = '';
  let client: S3Client;

  beforeAll(async () => {
    useBundledFfmpeg();
    const [startedRabbit, startedStore] = await Promise.all([startRabbitMq(), startSeaweed()]);
    rabbit = startedRabbit;
    objectStore = startedStore;
    endpoint = startedStore.endpoint;
    amqpUri = startedRabbit.amqpUri;
    client = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
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
    await rabbit?.stop();
    await objectStore?.stop();
  });

  it('streams an object to disk and treats a missing key as permanent', async () => {
    const storage = createS3ObjectStorage({
      endpoint,
      region,
      accessKey,
      secretKey,
      bucket,
      forcePathStyle: true,
    });
    const base = await mkdtemp(path.join(tmpdir(), 'zf-s3-'));
    const downloaded = path.join(base, 'downloaded.bin');

    await storage.ping();
    await storage.uploadFile('samples/clip.bin', clipPath, 'application/octet-stream');
    await storage.downloadToFile('samples/clip.bin', downloaded);
    expect((await stat(downloaded)).size).toBeGreaterThan(0);
    await storage.deleteObject('samples/clip.bin');

    const aborted = new AbortController();
    aborted.abort();
    await expect(
      storage.downloadToFile('samples/clip.bin', downloaded, aborted.signal),
    ).rejects.toMatchObject({
      code: 'PROCESSING_TIMEOUT',
    });
    await expect(storage.downloadToFile('samples/missing.bin', downloaded)).rejects.toMatchObject({
      kind: 'permanent',
      code: 'SOURCE_MISSING',
    });
  });

  it('retries onto the wait queue and dead-letters poison without confusing the two', async () => {
    const connection = await createRabbitMqConnection(amqpUri);
    await connection.assertTopology(createProcessorTopology());
    expect(connection.isConnected()).toBe(true);

    const actions: ('ack' | 'throw' | 'dlq')[] = ['ack', 'throw', 'dlq'];
    await connection.consume(
      UPLOADED_QUEUE,
      async (_message, context) => {
        const action = actions.shift();
        if (action === 'ack') {
          await context.ack();
          return;
        }
        if (action === 'dlq') {
          await context.deadLetter();
          return;
        }
        throw new Error('transient storage blip');
      },
      { retry: { maxAttempts: 5, baseDelayMs: 60_000, maxDelayMs: 60_000 } },
    );

    const probe = await amqp.connect(amqpUri);
    const channel = await probe.createChannel();
    const envelope = uploadedEnvelope('uploads/user-1/sample', 12);
    for (let index = 0; index < 3; index += 1) {
      channel.publish(EVENT_EXCHANGE, 'video.uploaded', Buffer.from(JSON.stringify(envelope)), {
        contentType: 'application/json',
        persistent: true,
      });
    }

    const retried = await pollQueue(channel, UPLOADED_RETRY_QUEUE);
    expect(String(retried.properties.headers?.['x-attempt'])).toBe('2');
    expect(retried.properties.expiration).toBe('60000');

    const dead = await pollQueue(channel, DLQ_QUEUE);
    expect(dead.fields.routingKey.length).toBeGreaterThan(0);

    channel.sendToQueue(UPLOADED_QUEUE, Buffer.from('not-json'), { persistent: true });
    const poison = await pollQueue(channel, DLQ_QUEUE);
    expect(poison.content.toString('utf8')).toBe('not-json');

    const stillWaiting = await channel.get(UPLOADED_QUEUE, { noAck: true });
    expect(stillWaiting).toBe(false);

    await channel.close();
    await probe.close();
    await connection.close();
    expect(connection.isConnected()).toBe(false);
  });

  it('packages frames for a real upload and becomes ready', async () => {
    const healthPort = 18181;
    const metricsPort = 19091;
    const workDir = await mkdtemp(path.join(tmpdir(), 'zf-worker-'));
    const sourceKey = `uploads/${ownerId}/${videoId}`;
    const clip = await stat(clipPath);

    const storage = createS3ObjectStorage({
      endpoint,
      region,
      accessKey,
      secretKey,
      bucket,
      forcePathStyle: true,
    });
    await storage.uploadFile(sourceKey, clipPath, 'video/mp4');
    const roundTrip = path.join(workDir, 'roundtrip.mp4');
    await storage.downloadToFile(sourceKey, roundTrip);
    expect((await stat(roundTrip)).size).toBe(clip.size);
    const probed = await createFfmpegFrameExtractor().extract(
      roundTrip,
      path.join(workDir, 'probe'),
    );
    expect(probed.length).toBeGreaterThan(0);

    process.env.AMQP_URL = amqpUri;
    process.env.S3_ENDPOINT = endpoint;
    process.env.S3_ACCESS_KEY = accessKey;
    process.env.S3_SECRET_KEY = secretKey;
    process.env.S3_REGION = region;
    process.env.S3_BUCKET = bucket;
    process.env.S3_FORCE_PATH_STYLE = 'true';
    process.env.WORK_DIR = workDir;
    process.env.PROCESSING_TIMEOUT_MS = '60000';
    process.env.MAX_ATTEMPTS = '3';
    process.env.RETRY_BASE_DELAY_MS = '1000';
    process.env.RETRY_MAX_DELAY_MS = '5000';
    process.env.HEALTH_PORT = String(healthPort);
    process.env.METRICS_PORT = String(metricsPort);
    process.env.LOG_LEVEL = 'info';
    process.env.SERVICE_VERSION = '0.0.0';

    const worker = await startWorker();
    try {
      const ready = await fetch(`http://127.0.0.1:${String(healthPort)}/readyz`);
      expect(ready.status).toBe(200);
      const metrics = await fetch(`http://127.0.0.1:${String(metricsPort)}/metrics`);
      expect(metrics.status).toBe(200);

      const probe = await amqp.connect(amqpUri);
      const channel = await probe.createChannel();
      const outcomes = await channel.assertQueue('', { exclusive: true });
      await channel.bindQueue(outcomes.queue, EVENT_EXCHANGE, 'video.processed');
      await channel.bindQueue(outcomes.queue, EVENT_EXCHANGE, 'video.failed');
      channel.publish(
        EVENT_EXCHANGE,
        'video.uploaded',
        Buffer.from(JSON.stringify(uploadedEnvelope(sourceKey, clip.size))),
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
});
