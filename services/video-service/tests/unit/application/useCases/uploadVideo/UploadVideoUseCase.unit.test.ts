import { Readable } from 'node:stream';

import { beforeEach, describe, expect, it } from 'vitest';

import { UploadVideoUseCase } from '../../../../../src/application/useCases/uploadVideo/UploadVideoUseCase.js';
import type { UploadVideoUseCaseInput } from '../../../../../src/application/useCases/uploadVideo/uploadVideo.dto.js';
import type { Video } from '../../../../../src/domain/entities/video.js';
import {
  InMemoryEventPublisher,
  InMemoryObjectStorage,
  InMemoryVideoListCache,
  InMemoryVideoRepository,
} from '../../../../support/in-memory.js';
import { CORRELATION_ID, OWNER_ID } from '../../../../support/videos.js';

const MAX_SIZE_BYTES = 16;

let videos: InMemoryVideoRepository;
let storage: InMemoryObjectStorage;
let publisher: InMemoryEventPublisher;
let cache: InMemoryVideoListCache;
let uploadVideo: UploadVideoUseCase;

beforeEach(() => {
  videos = new InMemoryVideoRepository();
  storage = new InMemoryObjectStorage();
  publisher = new InMemoryEventPublisher();
  cache = new InMemoryVideoListCache();
  uploadVideo = new UploadVideoUseCase(videos, storage, publisher, cache, MAX_SIZE_BYTES);
});

const anUpload = (bytes: number, originalFileName = 'aula.mp4'): UploadVideoUseCaseInput => ({
  ownerId: OWNER_ID,
  originalFileName,
  contentType: 'video/mp4',
  content: Readable.from([Buffer.alloc(bytes)]),
  correlationId: CORRELATION_ID,
});

const storedVideo = (): Video => {
  const [video] = [...videos.rows.values()];
  if (video === undefined) {
    throw new Error('expected one stored video');
  }
  return video;
};

describe('UploadVideoUseCase', () => {
  it('stores the file, records the video QUEUED and tells the worker', async () => {
    const result = await uploadVideo.execute(anUpload(10));

    const video = storedVideo();
    expect(result).toEqual({ ok: true, value: { videoId: video.id, status: 'QUEUED' } });
    expect(video.toJSON()).toMatchObject({
      ownerId: OWNER_ID,
      originalFileName: 'aula.mp4',
      sizeBytes: 10,
      sourceKey: `uploads/${OWNER_ID}/${video.id}`,
      status: 'QUEUED',
      version: 1,
    });
    expect(storage.objects.get(video.sourceKey)).toEqual({ sizeBytes: 10 });
    expect(publisher.published).toEqual([
      {
        eventType: 'video.uploaded',
        correlationId: CORRELATION_ID,
        payload: {
          videoId: video.id,
          ownerId: OWNER_ID,
          sourceKey: video.sourceKey,
          originalFileName: 'aula.mp4',
          sizeBytes: 10,
        },
      },
    ]);
    expect(cache.invalidated).toEqual([OWNER_ID]);
  });

  it('refuses a file the context does not accept before storing anything', async () => {
    const result = await uploadVideo.execute(anUpload(10, 'foto.png'));

    expect(result).toMatchObject({ ok: false, error: { code: 'UNSUPPORTED_EXTENSION' } });
    expect(storage.objects.size).toBe(0);
    expect(videos.rows.size).toBe(0);
  });

  it('answers 413 for a file above the limit and removes what was stored', async () => {
    const result = await uploadVideo.execute(anUpload(MAX_SIZE_BYTES + 1));

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'FILE_TOO_LARGE', statusCode: 413 },
    });
    expect(storage.objects.size).toBe(0);
    expect(videos.rows.size).toBe(0);
    expect(publisher.published).toHaveLength(0);
  });

  it('refuses an empty file and removes it', async () => {
    const result = await uploadVideo.execute(anUpload(0));

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_FILE_SIZE' } });
    expect(storage.objects.size).toBe(0);
  });

  it('marks the video FAILED and drops the file when the broker refuses the event', async () => {
    publisher.failWith = new Error('broker down');

    await expect(uploadVideo.execute(anUpload(10))).rejects.toMatchObject({
      code: 'VIDEO_NOT_QUEUED',
      statusCode: 503,
    });

    const video = storedVideo();
    expect(video.toJSON()).toMatchObject({ status: 'FAILED', errorCode: 'VIDEO_NOT_QUEUED' });
    expect(storage.objects.size).toBe(0);
    expect(cache.invalidated).toEqual([OWNER_ID]);
  });

  it('lets a storage failure through without recording a video', async () => {
    storage.failUploadWith = new Error('storage down');

    await expect(uploadVideo.execute(anUpload(10))).rejects.toThrow('storage down');
    expect(videos.rows.size).toBe(0);
  });
});
