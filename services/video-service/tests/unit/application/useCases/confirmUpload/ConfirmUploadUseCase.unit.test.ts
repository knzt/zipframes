import { beforeEach, describe, expect, it } from 'vitest';

import { ConfirmUploadUseCase } from '../../../../../src/application/useCases/confirmUpload/ConfirmUploadUseCase.js';
import type { Video } from '../../../../../src/domain/entities/video.js';
import {
  InMemoryEventPublisher,
  InMemoryObjectStorage,
  InMemoryVideoListCache,
  InMemoryVideoRepository,
} from '../../../../support/in-memory.js';
import {
  aVideo,
  CORRELATION_ID,
  MAX_UPLOAD_BYTES,
  OTHER_OWNER_ID,
  OWNER_ID,
  VIDEO_ID,
} from '../../../../support/videos.js';

const SOURCE_KEY = `uploads/${OWNER_ID}/${VIDEO_ID}`;

let videos: InMemoryVideoRepository;
let storage: InMemoryObjectStorage;
let publisher: InMemoryEventPublisher;
let cache: InMemoryVideoListCache;
let confirmUpload: ConfirmUploadUseCase;

beforeEach(() => {
  videos = new InMemoryVideoRepository().seed(aVideo('AWAITING_UPLOAD'));
  storage = new InMemoryObjectStorage().put(SOURCE_KEY, 4096);
  publisher = new InMemoryEventPublisher();
  cache = new InMemoryVideoListCache();
  confirmUpload = new ConfirmUploadUseCase(videos, storage, publisher, cache, MAX_UPLOAD_BYTES);
});

const input = { ownerId: OWNER_ID, videoId: VIDEO_ID, correlationId: CORRELATION_ID };

describe('a confirmed upload', () => {
  it('queues the video with the size the storage holds', async () => {
    const result = await confirmUpload.execute(input);

    expect(result).toEqual({ ok: true, value: { videoId: VIDEO_ID, status: 'QUEUED' } });
    expect(videos.rows.get(VIDEO_ID)?.toJSON()).toMatchObject({
      status: 'QUEUED',
      sizeBytes: 4096,
    });
  });

  it('publishes video.uploaded with the queued video and the correlation id', async () => {
    await confirmUpload.execute(input);

    expect(publisher.published).toEqual([
      {
        eventType: 'video.uploaded',
        correlationId: CORRELATION_ID,
        payload: {
          videoId: VIDEO_ID,
          ownerId: OWNER_ID,
          sourceKey: SOURCE_KEY,
          originalFileName: 'aula.mp4',
          sizeBytes: 4096,
        },
      },
    ]);
  });

  it('invalidates the owner list', async () => {
    await confirmUpload.execute(input);

    expect(cache.invalidated).toEqual([OWNER_ID]);
  });
});

describe('when the broker does not confirm', () => {
  it('stores nothing and asks the caller to retry', async () => {
    publisher.failWith = new Error('channel closed');

    await expect(confirmUpload.execute(input)).rejects.toMatchObject({
      code: 'VIDEO_NOT_QUEUED',
      statusCode: 503,
    });
    expect(videos.rows.get(VIDEO_ID)?.status).toBe('AWAITING_UPLOAD');
    expect(videos.saves).toBe(0);
  });

  it('succeeds on the retry once the broker is back', async () => {
    publisher.failWith = new Error('channel closed');
    await confirmUpload.execute(input).catch(() => undefined);
    publisher.failWith = null;

    const result = await confirmUpload.execute(input);

    expect(result.ok).toBe(true);
    expect(publisher.published).toHaveLength(1);
  });
});

describe('a rejected confirmation', () => {
  it('answers 404 for a video that does not exist', async () => {
    const result = await confirmUpload.execute({ ...input, videoId: OTHER_OWNER_ID });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VIDEO_NOT_FOUND', statusCode: 404 },
    });
  });

  it("answers 404, not 403, for another owner's video", async () => {
    const result = await confirmUpload.execute({ ...input, ownerId: OTHER_OWNER_ID });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VIDEO_NOT_FOUND', statusCode: 404 },
    });
    expect(publisher.published).toHaveLength(0);
  });

  it('answers 409 when the upload was already confirmed', async () => {
    videos.seed(aVideo('QUEUED'));

    const result = await confirmUpload.execute(input);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VIDEO_NOT_AWAITING_UPLOAD', statusCode: 409 },
    });
    expect(publisher.published).toHaveLength(0);
  });

  it('answers 409 when the file never reached the storage', async () => {
    storage.objects.clear();

    const result = await confirmUpload.execute(input);

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'UPLOAD_NOT_FOUND', statusCode: 409 },
    });
  });

  it('deletes a stored file above the limit and keeps the video waiting', async () => {
    storage.put(SOURCE_KEY, MAX_UPLOAD_BYTES + 1);

    const result = await confirmUpload.execute(input);

    expect(result).toMatchObject({ ok: false, error: { code: 'FILE_TOO_LARGE', statusCode: 400 } });
    expect(storage.deleted).toEqual([SOURCE_KEY]);
    expect(videos.rows.get(VIDEO_ID)?.status).toBe('AWAITING_UPLOAD');
  });

  it('lets a concurrent confirmation lose with a conflict, after it already published', async () => {
    /** Reads the row as it was before another request wrote version 1. */
    class StaleReadRepository extends InMemoryVideoRepository {
      override findByIdForOwner(): Promise<Video | null> {
        return Promise.resolve(aVideo('AWAITING_UPLOAD'));
      }
    }
    const racing = new ConfirmUploadUseCase(
      new StaleReadRepository().seed(aVideo('AWAITING_UPLOAD', { version: 1 })),
      storage,
      publisher,
      cache,
      MAX_UPLOAD_BYTES,
    );

    await expect(racing.execute(input)).rejects.toMatchObject({
      code: 'VIDEO_CONCURRENT_UPDATE',
      statusCode: 409,
    });
    // Publishing before the write means a losing race still publishes once:
    // a duplicate video.uploaded, which the worker's deterministic result
    // key and this domain's own idempotent consumers already tolerate.
    expect(publisher.published).toHaveLength(1);
  });
});
