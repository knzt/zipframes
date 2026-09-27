import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GetDownloadUrlUseCase } from '../../../../../src/application/useCases/getDownloadUrl/GetDownloadUrlUseCase.js';
import type { VideoStatus } from '../../../../../src/domain/valueObjects/videoStatus.js';
import { FakeStorageUrlSigner, InMemoryVideoRepository } from '../../../../support/in-memory.js';
import { aVideo, OTHER_OWNER_ID, OWNER_ID, VIDEO_ID } from '../../../../support/videos.js';

const DOWNLOAD_TTL_SECONDS = 300;
const RESULT_KEY = `outputs/${OWNER_ID}/${VIDEO_ID}.zip`;

let videos: InMemoryVideoRepository;
let signer: FakeStorageUrlSigner;
let getDownloadUrl: GetDownloadUrlUseCase;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-09-27T12:00:00.000Z') });
  videos = new InMemoryVideoRepository();
  signer = new FakeStorageUrlSigner();
  getDownloadUrl = new GetDownloadUrlUseCase(videos, signer, DOWNLOAD_TTL_SECONDS);
});

afterEach(() => {
  vi.useRealTimers();
});

const input = { ownerId: OWNER_ID, videoId: VIDEO_ID };

describe('GetDownloadUrlUseCase', () => {
  it('signs a short-lived URL for the package of a finished video', async () => {
    videos.seed(aVideo('DONE', { originalFileName: 'aula.final.mp4' }));

    const result = await getDownloadUrl.execute(input);

    expect(result).toEqual({
      ok: true,
      value: {
        videoId: VIDEO_ID,
        downloadUrl: `https://storage.test/${RESULT_KEY}?op=get`,
        expiresInSeconds: DOWNLOAD_TTL_SECONDS,
      },
    });
    expect(signer.downloads).toEqual([
      { key: RESULT_KEY, downloadFileName: 'aula.final-frames.zip', expiresInSeconds: 300 },
    ]);
  });

  it.each<VideoStatus>(['AWAITING_UPLOAD', 'QUEUED', 'PROCESSING', 'FAILED'])(
    'answers 409 while the video is %s',
    async (status) => {
      videos.seed(aVideo(status));

      expect(await getDownloadUrl.execute(input)).toMatchObject({
        ok: false,
        error: { code: 'VIDEO_NOT_READY', statusCode: 409 },
      });
    },
  );

  it.each<VideoStatus>(['EXPIRED', 'DELETED'])('answers 410 Gone for %s', async (status) => {
    videos.seed(aVideo(status));

    expect(await getDownloadUrl.execute(input)).toMatchObject({
      ok: false,
      error: { code: 'VIDEO_GONE', statusCode: 410 },
    });
    expect(signer.downloads).toHaveLength(0);
  });

  it('answers 410 once the window closed, before the sweep runs', async () => {
    videos.seed(aVideo('DONE'));
    vi.setSystemTime(new Date('2026-09-28T10:00:00.000Z'));

    expect(await getDownloadUrl.execute(input)).toMatchObject({
      ok: false,
      error: { statusCode: 410 },
    });
  });

  it('answers 404 for another owner', async () => {
    videos.seed(aVideo('DONE'));

    expect(await getDownloadUrl.execute({ ...input, ownerId: OTHER_OWNER_ID })).toMatchObject({
      ok: false,
      error: { statusCode: 404 },
    });
  });
});
