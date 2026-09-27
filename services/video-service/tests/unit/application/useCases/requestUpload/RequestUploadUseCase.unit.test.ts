import { beforeEach, describe, expect, it } from 'vitest';

import { RequestUploadUseCase } from '../../../../../src/application/useCases/requestUpload/RequestUploadUseCase.js';
import {
  FakeStorageUrlSigner,
  InMemoryVideoListCache,
  InMemoryVideoRepository,
} from '../../../../support/in-memory.js';
import { MAX_UPLOAD_BYTES, OWNER_ID } from '../../../../support/videos.js';

const UPLOAD_TTL_SECONDS = 900;

let videos: InMemoryVideoRepository;
let signer: FakeStorageUrlSigner;
let cache: InMemoryVideoListCache;
let requestUpload: RequestUploadUseCase;

beforeEach(() => {
  videos = new InMemoryVideoRepository();
  signer = new FakeStorageUrlSigner();
  cache = new InMemoryVideoListCache();
  requestUpload = new RequestUploadUseCase(
    videos,
    signer,
    cache,
    MAX_UPLOAD_BYTES,
    UPLOAD_TTL_SECONDS,
  );
});

const input = {
  ownerId: OWNER_ID,
  originalFileName: 'aula.mp4',
  contentType: 'video/mp4',
  sizeBytes: 2048,
};

describe('RequestUploadUseCase', () => {
  it('stores a video waiting for its file and returns the upload URL', async () => {
    const result = await requestUpload.execute(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = videos.rows.get(result.value.videoId);
    expect(stored?.status).toBe('AWAITING_UPLOAD');
    expect(result.value).toEqual({
      videoId: stored?.id,
      uploadUrl: `https://storage.test/${String(stored?.sourceKey)}?op=put`,
      sourceKey: `uploads/${OWNER_ID}/${String(stored?.id)}`,
      expiresInSeconds: UPLOAD_TTL_SECONDS,
    });
  });

  it('signs the declared type and size into the URL', async () => {
    await requestUpload.execute(input);

    expect(signer.uploads).toEqual([
      expect.objectContaining({ contentType: 'video/mp4', sizeBytes: 2048, expiresInSeconds: 900 }),
    ]);
  });

  it('invalidates the owner list, which now shows the new video', async () => {
    await requestUpload.execute(input);

    expect(cache.invalidated).toEqual([OWNER_ID]);
  });

  it('stores and signs nothing when the request breaks a rule', async () => {
    const result = await requestUpload.execute({ ...input, sizeBytes: MAX_UPLOAD_BYTES + 1 });

    expect(result).toMatchObject({ ok: false, error: { code: 'FILE_TOO_LARGE', statusCode: 400 } });
    expect(videos.rows.size).toBe(0);
    expect(signer.uploads).toHaveLength(0);
  });
});
