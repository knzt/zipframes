import { InternalServerError, TimeoutError, UnavailableError } from '@zipframes/core';
import { describe, expect, it, vi } from 'vitest';

import type {
  EventPublisher,
  EventPublisherInput,
} from '../../../../../src/application/interfaces/gateways/EventPublisher.js';
import type { FrameExtractor } from '../../../../../src/application/interfaces/gateways/FrameExtractor.js';
import type { ObjectStorage } from '../../../../../src/application/interfaces/gateways/ObjectStorage.js';
import type { ArchiveBuilder } from '../../../../../src/application/interfaces/services/ArchiveBuilder.js';
import type { WorkDirectory } from '../../../../../src/application/interfaces/services/WorkDirectory.js';
import {
  ProcessUploadedVideoUseCase,
  type ProcessUploadedVideoUseCaseInput,
} from '../../../../../src/application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';

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
  const publish = vi.fn(async (_input: EventPublisherInput) => undefined);
  return { publish };
};

const publishedTypes = (events: { readonly publish: ReturnType<typeof vi.fn> }): string[] =>
  events.publish.mock.calls.map((call) => {
    const event = call[0] as EventPublisherInput;
    return event.eventType;
  });

const useCase = ({
  objectStorage,
  frameExtractor,
  archiveBuilder,
  workDirectory,
  eventPublisher,
  processingTimeoutMs,
  onDiscardOriginalFailed,
}: {
  readonly objectStorage: ObjectStorage;
  readonly frameExtractor: FrameExtractor;
  readonly archiveBuilder: ArchiveBuilder;
  readonly workDirectory: WorkDirectory;
  readonly eventPublisher: EventPublisher;
  readonly processingTimeoutMs: number;
  readonly onDiscardOriginalFailed?: (
    job: ProcessUploadedVideoUseCaseInput,
    error: unknown,
  ) => void;
}): ProcessUploadedVideoUseCase =>
  new ProcessUploadedVideoUseCase(
    objectStorage,
    frameExtractor,
    archiveBuilder,
    workDirectory,
    eventPublisher,
    processingTimeoutMs,
    onDiscardOriginalFailed,
  );

describe('ProcessUploadedVideoUseCase', () => {
  it('publishes started and processed, then deletes the source', async () => {
    const eventPublisher = eventsDouble();
    const downloadToFile = vi.fn(async () => undefined);
    const uploadFile = vi.fn(async () => undefined);
    const deleteObject = vi.fn(async () => undefined);
    const extract = vi.fn(async () => ['/tmp/frame_0001.png']);
    const createZip = vi.fn(async () => undefined);
    const createTempDir = vi.fn(async () => '/tmp/job');
    const removeDir = vi.fn(async () => undefined);

    const processUploadedVideo = useCase({
      objectStorage: { downloadToFile, uploadFile, deleteObject },
      frameExtractor: { extract },
      archiveBuilder: { createZip },
      workDirectory: { createTempDir, removeDir },
      eventPublisher,
      processingTimeoutMs: 60_000,
    });

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
    expect(publishedTypes(eventPublisher)).toEqual(['video.processing.started', 'video.processed']);
    expect(eventPublisher.publish.mock.calls[1]?.[0]).toMatchObject({
      payload: {
        ownerId,
        originalFileName: 'demo.mp4',
        resultKey: `outputs/${ownerId}/${videoId}.zip`,
      },
    });
  });

  it('publishes video.failed on unprocessable media and returns media_rejected', async () => {
    const eventPublisher = eventsDouble();
    const processUploadedVideo = useCase({
      objectStorage: {
        downloadToFile: async () => {
          throw new InternalServerError('UNSUPPORTED_MEDIA', 'bad file');
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
      },
      frameExtractor: { extract: async () => [] },
      archiveBuilder: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      eventPublisher,
      processingTimeoutMs: 60_000,
    });

    const processingResult = await processUploadedVideo.execute(job);

    expect(processingResult).toBe('media_rejected');
    expect(publishedTypes(eventPublisher)).toEqual(['video.processing.started', 'video.failed']);
  });

  it('rethrows retryable errors for the consumer to retry', async () => {
    const eventPublisher = eventsDouble();
    const processUploadedVideo = useCase({
      objectStorage: {
        downloadToFile: async () => {
          throw new UnavailableError('STORAGE_DOWNLOAD_FAILED', 'down');
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
      },
      frameExtractor: { extract: async () => [] },
      archiveBuilder: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      eventPublisher,
      processingTimeoutMs: 60_000,
    });

    await expect(processUploadedVideo.execute(job)).rejects.toMatchObject({
      retryable: true,
      code: 'STORAGE_DOWNLOAD_FAILED',
    });
    expect(publishedTypes(eventPublisher)).toEqual(['video.processing.started']);
  });

  it('aborts via AbortSignal on timeout and cleans up the work dir', async () => {
    const removeDir = vi.fn(async () => undefined);
    const processUploadedVideo = useCase({
      objectStorage: {
        downloadToFile: async (_key, _path, signal) => {
          await new Promise<void>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new TimeoutError('PROCESSING_TIMEOUT', 'cancelled'));
            });
          });
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
      },
      frameExtractor: { extract: async () => [] },
      archiveBuilder: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir,
      },
      eventPublisher: { publish: vi.fn(async () => undefined) },
      processingTimeoutMs: 20,
    });

    await expect(processUploadedVideo.execute(job)).rejects.toMatchObject({
      code: 'PROCESSING_TIMEOUT',
    });
    expect(removeDir).toHaveBeenCalledWith('/tmp/job');
  });

  it('invokes onDiscardOriginalFailed when cleanup delete fails', async () => {
    const onDiscardOriginalFailed = vi.fn();
    const processUploadedVideo = useCase({
      objectStorage: {
        downloadToFile: async () => undefined,
        uploadFile: async () => undefined,
        deleteObject: async () => {
          throw new Error('delete boom');
        },
      },
      frameExtractor: { extract: async () => ['/tmp/frame_0001.png'] },
      archiveBuilder: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      eventPublisher: { publish: vi.fn(async () => undefined) },
      processingTimeoutMs: 60_000,
      onDiscardOriginalFailed,
    });

    await processUploadedVideo.execute(job);

    expect(onDiscardOriginalFailed).toHaveBeenCalledOnce();
  });

  it('rejects a video that yields no frames and deletes the source', async () => {
    const eventPublisher = eventsDouble();
    const deleteObject = vi.fn(async () => undefined);
    const processUploadedVideo = useCase({
      objectStorage: {
        downloadToFile: async () => undefined,
        uploadFile: async () => undefined,
        deleteObject,
      },
      frameExtractor: { extract: async () => [] },
      archiveBuilder: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      eventPublisher,
      processingTimeoutMs: 60_000,
    });

    const processingResult = await processUploadedVideo.execute(job);

    expect(processingResult).toBe('media_rejected');
    expect(deleteObject).toHaveBeenCalledWith(job.sourceKey);
    expect(publishedTypes(eventPublisher)).toEqual(['video.processing.started', 'video.failed']);
    const failed = eventPublisher.publish.mock.calls[1]?.[0] as EventPublisherInput;
    expect(failed.payload).toMatchObject({
      errorCode: 'NO_FRAMES',
      originalFileName: 'demo.mp4',
      ownerId,
    });
  });

  it('stores an extensionless upload as original.bin', async () => {
    const downloadToFile = vi.fn(async () => undefined);
    const processUploadedVideo = useCase({
      objectStorage: {
        downloadToFile,
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
      },
      frameExtractor: { extract: async () => ['/tmp/frame_0001.png'] },
      archiveBuilder: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      eventPublisher: eventsDouble(),
      processingTimeoutMs: 60_000,
    });

    await processUploadedVideo.execute({ ...job, originalFileName: 'clip' });

    expect(downloadToFile).toHaveBeenCalledWith(
      job.sourceKey,
      '/tmp/job/original.bin',
      expect.any(AbortSignal),
    );
  });

  it('lowercases the stored original extension', async () => {
    const downloadToFile = vi.fn(async () => undefined);
    const processUploadedVideo = useCase({
      objectStorage: {
        downloadToFile,
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
      },
      frameExtractor: { extract: async () => ['/tmp/frame_0001.png'] },
      archiveBuilder: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      eventPublisher: eventsDouble(),
      processingTimeoutMs: 60_000,
    });

    await processUploadedVideo.execute({ ...job, originalFileName: 'clip.MP4' });

    expect(downloadToFile).toHaveBeenCalledWith(
      job.sourceKey,
      '/tmp/job/original.mp4',
      expect.any(AbortSignal),
    );
  });

  it('rethrows an unexpected error as retryable and does not publish video.failed', async () => {
    const eventPublisher = eventsDouble();
    const processUploadedVideo = useCase({
      objectStorage: {
        downloadToFile: async () => {
          throw new Error('disk full');
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
      },
      frameExtractor: { extract: async () => [] },
      archiveBuilder: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      eventPublisher,
      processingTimeoutMs: 60_000,
    });

    await expect(processUploadedVideo.execute(job)).rejects.toMatchObject({
      retryable: true,
      code: 'UNEXPECTED',
      message: 'disk full',
    });
    expect(publishedTypes(eventPublisher)).toEqual(['video.processing.started']);
  });

  it('wraps a generic error as PROCESSING_TIMEOUT once the deadline has fired', async () => {
    const processUploadedVideo = useCase({
      objectStorage: {
        downloadToFile: async (_key, _path, signal) => {
          await new Promise<void>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new Error('socket hang up'));
            });
          });
        },
        uploadFile: async () => undefined,
        deleteObject: async () => undefined,
      },
      frameExtractor: { extract: async () => [] },
      archiveBuilder: { createZip: async () => undefined },
      workDirectory: {
        createTempDir: async () => '/tmp/job',
        removeDir: async () => undefined,
      },
      eventPublisher: eventsDouble(),
      processingTimeoutMs: 20,
    });

    await expect(processUploadedVideo.execute(job)).rejects.toMatchObject({
      retryable: true,
      code: 'PROCESSING_TIMEOUT',
      message: 'processing exceeded 20ms',
    });
  });
});
