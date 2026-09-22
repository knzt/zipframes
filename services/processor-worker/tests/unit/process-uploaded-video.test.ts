import { createPublisher, createConsumer, createDefaultTopology } from '@zipframes/communication';
import { createLogger } from '@zipframes/logger';
import { createInMemoryBroker } from '@zipframes/test-toolkit';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { createAmqpEventPublisher } from '../../src/infrastructure/gateways/amqp-event-publisher.js';
import { createVideoUploadedConsumer } from '../../src/infrastructure/messaging/video-uploaded-consumer.js';
import { UPLOADED_QUEUE } from '../../src/infrastructure/messaging/topology.js';
import { createProcessUploadedVideo } from '../../src/application/use-cases/process-uploaded-video.js';
import { ProcessingError } from '../../src/domain/errors.js';

const ownerId = 'user-1';
const videoId = '11111111-1111-4111-8111-111111111111';
const correlationId = '22222222-2222-4222-8222-222222222222';

const uploadedEnvelope = {
  eventId: '33333333-3333-4333-8333-333333333333',
  eventType: 'video.uploaded' as const,
  version: 1 as const,
  occurredAt: '2026-09-20T12:00:00.000Z',
  correlationId,
  payload: {
    videoId,
    ownerId,
    sourceKey: `uploads/${ownerId}/${videoId}`,
    originalFileName: 'demo.mp4',
    sizeBytes: 1024,
  },
};

const silentLogger = createLogger({
  service: 'processor-worker-test',
  version: '0.0.0',
  level: 'error',
  destination: { write: () => undefined },
});

const noopPing = async (): Promise<void> => undefined;

describe('processUploadedVideo', () => {
  it('publishes started and processed, then deletes the source', async () => {
    const broker = createInMemoryBroker();
    await broker.assertTopology(
      createDefaultTopology({
        consumerQueues: [{ name: UPLOADED_QUEUE, routingKeys: ['video.uploaded'] }],
      }),
    );
    const events = createAmqpEventPublisher({
      publisher: createPublisher(broker),
      createId: () => randomUUID(),
      now: () => new Date('2026-09-20T12:00:05.000Z'),
    });

    const downloadToFile = vi.fn(async () => undefined);
    const uploadFile = vi.fn(async () => undefined);
    const deleteObject = vi.fn(async () => undefined);
    const extract = vi.fn(async () => ['/tmp/frame_0001.png']);
    const createZip = vi.fn(async () => undefined);
    const createTempDir = vi.fn(async () => '/tmp/job');
    const removeDir = vi.fn(async () => undefined);

    const processUploadedVideo = createProcessUploadedVideo({
      storage: { downloadToFile, uploadFile, deleteObject, ping: noopPing },
      extractor: { extract },
      archive: { createZip },
      workDirectory: { createTempDir, removeDir },
      events,
      now: () => new Date('2026-09-20T12:00:05.000Z'),
      processingTimeoutMs: 60_000,
    });

    const processingResult = await processUploadedVideo({
      ...uploadedEnvelope.payload,
      attempt: 1,
      correlationId,
    });

    expect(processingResult).toBe('frames_packaged');
    expect(downloadToFile).toHaveBeenCalledWith(
      uploadedEnvelope.payload.sourceKey,
      '/tmp/job/original.mp4',
      expect.any(AbortSignal),
    );
    expect(uploadFile).toHaveBeenCalledWith(
      `outputs/${ownerId}/${videoId}.zip`,
      '/tmp/job/frames.zip',
      'application/zip',
      expect.any(AbortSignal),
    );
    expect(extract).toHaveBeenCalledWith(
      '/tmp/job/original.mp4',
      '/tmp/job/frames',
      expect.any(AbortSignal),
    );
    expect(deleteObject).toHaveBeenCalledWith(uploadedEnvelope.payload.sourceKey);
    expect(removeDir).toHaveBeenCalledWith('/tmp/job');

    const types = broker.published.map((message) => message.envelope.eventType);
    expect(types).toEqual(['video.processing.started', 'video.processed']);
  });

  it('publishes video.failed on unprocessable media and returns media_rejected', async () => {
    const broker = createInMemoryBroker();
    const events = createAmqpEventPublisher({
      publisher: createPublisher(broker),
      createId: () => randomUUID(),
      now: () => new Date('2026-09-20T12:00:05.000Z'),
    });

    const processUploadedVideo = createProcessUploadedVideo({
      storage: {
        downloadToFile: async () => {
          throw new ProcessingError('permanent', 'UNSUPPORTED_MEDIA', 'bad file');
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
        ping: noopPing,
      },
      extractor: { extract: async () => [] },
      archive: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      events,
      now: () => new Date('2026-09-20T12:00:05.000Z'),
      processingTimeoutMs: 60_000,
    });

    const processingResult = await processUploadedVideo({
      ...uploadedEnvelope.payload,
      attempt: 1,
      correlationId,
    });

    expect(processingResult).toBe('media_rejected');
    expect(broker.published.map((m) => m.envelope.eventType)).toEqual([
      'video.processing.started',
      'video.failed',
    ]);
  });

  it('rethrows transient errors for the consumer to retry', async () => {
    const broker = createInMemoryBroker();
    const events = createAmqpEventPublisher({
      publisher: createPublisher(broker),
      createId: () => randomUUID(),
      now: () => new Date(),
    });

    const processUploadedVideo = createProcessUploadedVideo({
      storage: {
        downloadToFile: async () => {
          throw new ProcessingError('transient', 'STORAGE_DOWNLOAD_FAILED', 'down');
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
        ping: noopPing,
      },
      extractor: { extract: async () => [] },
      archive: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      events,
      now: () => new Date(),
      processingTimeoutMs: 60_000,
    });

    await expect(
      processUploadedVideo({
        ...uploadedEnvelope.payload,
        attempt: 1,
        correlationId,
      }),
    ).rejects.toMatchObject({ kind: 'transient', code: 'STORAGE_DOWNLOAD_FAILED' });
  });

  it('aborts via AbortSignal on timeout and cleans up the work dir', async () => {
    const removeDir = vi.fn(async () => undefined);
    const processUploadedVideo = createProcessUploadedVideo({
      storage: {
        downloadToFile: async (_key, _path, signal) => {
          await new Promise<void>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new ProcessingError('transient', 'PROCESSING_TIMEOUT', 'cancelled'));
            });
          });
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
        ping: noopPing,
      },
      extractor: { extract: async () => [] },
      archive: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir,
      },
      events: { publish: async () => undefined },
      now: () => new Date(),
      processingTimeoutMs: 20,
    });

    await expect(
      processUploadedVideo({
        ...uploadedEnvelope.payload,
        attempt: 1,
        correlationId,
      }),
    ).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' });
    expect(removeDir).toHaveBeenCalledWith('/tmp/job');
  });

  it('invokes onDiscardOriginalFailed when cleanup delete fails', async () => {
    const onDiscardOriginalFailed = vi.fn();
    const processUploadedVideo = createProcessUploadedVideo({
      storage: {
        downloadToFile: async () => undefined,
        uploadFile: async () => undefined,
        deleteObject: async () => {
          throw new Error('delete boom');
        },
        ping: noopPing,
      },
      extractor: { extract: async () => ['/tmp/frame_0001.png'] },
      archive: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      events: { publish: async () => undefined },
      now: () => new Date(),
      processingTimeoutMs: 60_000,
      onDiscardOriginalFailed,
    });

    await processUploadedVideo({
      ...uploadedEnvelope.payload,
      attempt: 1,
      correlationId,
    });

    expect(onDiscardOriginalFailed).toHaveBeenCalledOnce();
  });
});

describe('video uploaded consumer + in-memory broker', () => {
  it('acks a successful processing path', async () => {
    const broker = createInMemoryBroker();
    await broker.assertTopology(
      createDefaultTopology({
        consumerQueues: [{ name: UPLOADED_QUEUE, routingKeys: ['video.uploaded'] }],
      }),
    );
    const events = createAmqpEventPublisher({
      publisher: createPublisher(broker),
      createId: () => '44444444-4444-4444-8444-444444444444',
      now: () => new Date('2026-09-20T12:00:05.000Z'),
    });

    const processUploadedVideo = createProcessUploadedVideo({
      storage: {
        downloadToFile: async () => undefined,
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
        ping: noopPing,
      },
      extractor: { extract: async () => ['/tmp/frame_0001.png'] },
      archive: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      events,
      now: () => new Date('2026-09-20T12:00:05.000Z'),
      processingTimeoutMs: 60_000,
    });

    const consumer = createVideoUploadedConsumer({
      processUploadedVideo,
      events,
      retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 },
      logger: silentLogger,
    });

    await broker.publish(uploadedEnvelope, {
      exchange: 'zipframes.events',
      routingKey: 'video.uploaded',
    });

    const runner = createConsumer(broker, consumer, {
      queue: UPLOADED_QUEUE,
      retry: { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 100 },
      deadLetterQueue: 'zipframes.events.dlq',
    });
    await runner.start();

    expect(broker.queues.get(UPLOADED_QUEUE)).toEqual([]);
    expect(broker.published.some((m) => m.envelope.eventType === 'video.processed')).toBe(true);
  });
});
