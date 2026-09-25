import { describe, expect, it, vi } from 'vitest';

import type {
  EventPublisher,
  ProcessingPublication,
} from '../../../../../src/application/interfaces/gateways/EventPublisher.js';
import { ProcessUploadedVideoUseCase } from '../../../../../src/application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';
import { ProcessingError } from '../../../../../src/domain/errors/processingError.js';

const ownerId = 'user-1';
const videoId = '11111111-1111-4111-8111-111111111111';
const correlationId = '22222222-2222-4222-8222-222222222222';

const job = {
  videoId,
  ownerId,
  sourceKey: `uploads/${ownerId}/${videoId}`,
  originalFileName: 'demo.mp4',
  sizeBytes: 1024,
  attempt: 1,
  correlationId,
};

const eventsDouble = (): EventPublisher & { readonly publish: ReturnType<typeof vi.fn> } => {
  const publish = vi.fn(async (_event: ProcessingPublication) => undefined);
  return { publish };
};

const publishedTypes = (events: { readonly publish: ReturnType<typeof vi.fn> }): string[] =>
  events.publish.mock.calls.map((call) => {
    const event = call[0] as ProcessingPublication;
    return event.eventType;
  });

describe('ProcessUploadedVideoUseCase', () => {
  it('publishes started and processed, then deletes the source', async () => {
    const events = eventsDouble();
    const downloadToFile = vi.fn(async () => undefined);
    const uploadFile = vi.fn(async () => undefined);
    const deleteObject = vi.fn(async () => undefined);
    const extract = vi.fn(async () => ['/tmp/frame_0001.png']);
    const createZip = vi.fn(async () => undefined);
    const createTempDir = vi.fn(async () => '/tmp/job');
    const removeDir = vi.fn(async () => undefined);

    const processUploadedVideo = new ProcessUploadedVideoUseCase(
      { downloadToFile, uploadFile, deleteObject },
      { extract },
      { createZip },
      { createTempDir, removeDir },
      events,
      () => new Date('2026-09-20T12:00:05.000Z'),
      60_000,
    );

    const processingResult = await processUploadedVideo.execute(job);

    expect(processingResult).toBe('frames_packaged');
    expect(downloadToFile).toHaveBeenCalledWith(
      job.sourceKey,
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
    expect(deleteObject).toHaveBeenCalledWith(job.sourceKey);
    expect(removeDir).toHaveBeenCalledWith('/tmp/job');
    expect(publishedTypes(events)).toEqual(['video.processing.started', 'video.processed']);
  });

  it('publishes video.failed on unprocessable media and returns media_rejected', async () => {
    const events = eventsDouble();
    const processUploadedVideo = new ProcessUploadedVideoUseCase(
      {
        downloadToFile: async () => {
          throw new ProcessingError(false, 'UNSUPPORTED_MEDIA', 'bad file');
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
      },
      { extract: async () => [] },
      { createZip: async () => undefined },
      {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      events,
      () => new Date('2026-09-20T12:00:05.000Z'),
      60_000,
    );

    const processingResult = await processUploadedVideo.execute(job);

    expect(processingResult).toBe('media_rejected');
    expect(publishedTypes(events)).toEqual(['video.processing.started', 'video.failed']);
  });

  it('rethrows retryable errors for the consumer to retry', async () => {
    const events = eventsDouble();
    const processUploadedVideo = new ProcessUploadedVideoUseCase(
      {
        downloadToFile: async () => {
          throw new ProcessingError(true, 'STORAGE_DOWNLOAD_FAILED', 'down');
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
      },
      { extract: async () => [] },
      { createZip: async () => undefined },
      {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      events,
      () => new Date(),
      60_000,
    );

    await expect(processUploadedVideo.execute(job)).rejects.toMatchObject({
      retryable: true,
      code: 'STORAGE_DOWNLOAD_FAILED',
    });
    expect(publishedTypes(events)).toEqual(['video.processing.started']);
  });

  it('aborts via AbortSignal on timeout and cleans up the work dir', async () => {
    const removeDir = vi.fn(async () => undefined);
    const processUploadedVideo = new ProcessUploadedVideoUseCase(
      {
        downloadToFile: async (_key, _path, signal) => {
          await new Promise<void>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new ProcessingError(true, 'PROCESSING_TIMEOUT', 'cancelled'));
            });
          });
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
      },
      { extract: async () => [] },
      { createZip: async () => undefined },
      {
        createTempDir: async () => '/tmp/job',
        removeDir,
      },
      { publish: vi.fn(async () => undefined) },
      () => new Date(),
      20,
    );

    await expect(processUploadedVideo.execute(job)).rejects.toMatchObject({
      code: 'PROCESSING_TIMEOUT',
    });
    expect(removeDir).toHaveBeenCalledWith('/tmp/job');
  });

  it('invokes onDiscardOriginalFailed when cleanup delete fails', async () => {
    const onDiscardOriginalFailed = vi.fn();
    const processUploadedVideo = new ProcessUploadedVideoUseCase(
      {
        downloadToFile: async () => undefined,
        uploadFile: async () => undefined,
        deleteObject: async () => {
          throw new Error('delete boom');
        },
      },
      { extract: async () => ['/tmp/frame_0001.png'] },
      { createZip: async () => undefined },
      {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      { publish: vi.fn(async () => undefined) },
      () => new Date(),
      60_000,
      onDiscardOriginalFailed,
    );

    await processUploadedVideo.execute(job);

    expect(onDiscardOriginalFailed).toHaveBeenCalledOnce();
  });
});
