import { beforeEach, describe, expect, it } from 'vitest';

import { DeleteVideoUseCase } from '../../../../../src/application/useCases/deleteVideo/DeleteVideoUseCase.js';
import type { VideoStatus } from '../../../../../src/domain/valueObjects/videoStatus.js';
import {
  InMemoryObjectStorage,
  InMemoryVideoListCache,
  InMemoryVideoRepository,
} from '../../../../support/in-memory.js';
import { aVideo, OTHER_OWNER_ID, OWNER_ID, VIDEO_ID } from '../../../../support/videos.js';

const SOURCE_KEY = `uploads/${OWNER_ID}/${VIDEO_ID}`;
const RESULT_KEY = `outputs/${OWNER_ID}/${VIDEO_ID}.zip`;

let videos: InMemoryVideoRepository;
let storage: InMemoryObjectStorage;
let cache: InMemoryVideoListCache;
let deleteVideo: DeleteVideoUseCase;

beforeEach(() => {
  videos = new InMemoryVideoRepository();
  storage = new InMemoryObjectStorage();
  cache = new InMemoryVideoListCache();
  deleteVideo = new DeleteVideoUseCase(videos, storage, cache);
});

const input = { ownerId: OWNER_ID, videoId: VIDEO_ID };

describe('DeleteVideoUseCase', () => {
  it('removes the files that still exist, then marks the video DELETED', async () => {
    videos.seed(aVideo('DONE'));

    const result = await deleteVideo.execute(input);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(storage.deleted).toEqual([SOURCE_KEY, RESULT_KEY]);
    expect(videos.rows.get(VIDEO_ID)?.toJSON()).toMatchObject({
      status: 'DELETED',
      resultKey: null,
    });
    expect(cache.invalidated).toEqual([OWNER_ID]);
  });

  it('removes the original of a failed video, which never got a package', async () => {
    videos.seed(aVideo('FAILED'));

    await deleteVideo.execute(input);

    expect(storage.deleted).toEqual([SOURCE_KEY]);
  });

  it('keeps the video untouched when a file cannot be removed, so the owner can retry', async () => {
    videos.seed(aVideo('DONE'));
    storage.failDeleteWith = new Error('storage down');

    await expect(deleteVideo.execute(input)).rejects.toThrow('storage down');
    expect(videos.rows.get(VIDEO_ID)?.status).toBe('DONE');
  });

  it.each<VideoStatus>(['QUEUED', 'PROCESSING'])(
    'answers 409 while the video is %s and touches nothing',
    async (status) => {
      videos.seed(aVideo(status));

      expect(await deleteVideo.execute(input)).toMatchObject({
        ok: false,
        error: { code: 'VIDEO_IN_PROCESSING', statusCode: 409 },
      });
      expect(storage.deleted).toHaveLength(0);
    },
  );

  it('is idempotent for a video already deleted', async () => {
    videos.seed(aVideo('DELETED'));

    expect(await deleteVideo.execute(input)).toEqual({ ok: true, value: undefined });
    expect(videos.saves).toBe(0);
    expect(storage.deleted).toHaveLength(0);
  });

  it('answers 404 for another owner', async () => {
    videos.seed(aVideo('DONE'));

    expect(await deleteVideo.execute({ ...input, ownerId: OTHER_OWNER_ID })).toMatchObject({
      ok: false,
      error: { statusCode: 404 },
    });
    expect(storage.deleted).toHaveLength(0);
  });
});
