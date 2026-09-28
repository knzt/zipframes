import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExpireFramesPackagesUseCase } from '../../../../../src/application/useCases/expireFramesPackages/ExpireFramesPackagesUseCase.js';
import type { Video } from '../../../../../src/domain/entities/video.js';
import {
  InMemoryObjectStorage,
  InMemoryVideoListCache,
  InMemoryVideoRepository,
} from '../../../../support/in-memory.js';
import { aVideo, OWNER_ID } from '../../../../support/videos.js';

const ID_A = '00000000-0000-4000-8000-00000000000a';
const ID_B = '00000000-0000-4000-8000-00000000000b';
const AFTER_WINDOW = new Date('2026-09-28T10:00:00.000Z');

let videos: InMemoryVideoRepository;
let storage: InMemoryObjectStorage;
let cache: InMemoryVideoListCache;
let onExpireFailed: ReturnType<typeof vi.fn>;
let expire: ExpireFramesPackagesUseCase;

beforeEach(() => {
  vi.useFakeTimers({ now: AFTER_WINDOW });
  videos = new InMemoryVideoRepository().seed(
    aVideo('DONE', { id: ID_A }),
    aVideo('DONE', { id: ID_B }),
  );
  storage = new InMemoryObjectStorage();
  cache = new InMemoryVideoListCache();
  onExpireFailed = vi.fn();
  expire = new ExpireFramesPackagesUseCase(videos, storage, cache, 100, onExpireFailed);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ExpireFramesPackagesUseCase', () => {
  it('deletes each expired package and marks the video EXPIRED', async () => {
    const result = await expire.execute();

    expect(result).toEqual({ expired: 2, failed: 0 });
    expect(storage.deleted).toContain(`outputs/${OWNER_ID}/${ID_A}.zip`);
    expect(storage.deleted).toContain(`uploads/${OWNER_ID}/${ID_A}`);
    expect(videos.rows.get(ID_A)?.toJSON()).toMatchObject({ status: 'EXPIRED', resultKey: null });
    expect(cache.invalidated).toEqual([OWNER_ID, OWNER_ID]);
  });

  it('leaves videos still inside the window alone', async () => {
    vi.setSystemTime(new Date('2026-09-28T09:59:59.999Z'));

    expect(await expire.execute()).toEqual({ expired: 0, failed: 0 });
    expect(storage.deleted).toHaveLength(0);
  });

  it('keeps sweeping after one video fails, and reports it', async () => {
    const failing = new Error('conflict');
    class FlakyRepository extends InMemoryVideoRepository {
      override save(video: Video): Promise<Video> {
        return video.id === ID_A ? Promise.reject(failing) : super.save(video);
      }
    }
    const flaky = new FlakyRepository().seed(
      aVideo('DONE', { id: ID_A }),
      aVideo('DONE', { id: ID_B }),
    );
    const sweep = new ExpireFramesPackagesUseCase(flaky, storage, cache, 100, onExpireFailed);

    expect(await sweep.execute()).toEqual({ expired: 1, failed: 1 });
    expect(onExpireFailed).toHaveBeenCalledWith(ID_A, failing);
    expect(flaky.rows.get(ID_B)?.status).toBe('EXPIRED');
  });

  it('skips a candidate that is no longer expirable when it is read', async () => {
    class StaleRepository extends InMemoryVideoRepository {
      override findExpired(): Promise<readonly Video[]> {
        return Promise.resolve([aVideo('FAILED', { id: ID_A })]);
      }
    }
    const sweep = new ExpireFramesPackagesUseCase(new StaleRepository(), storage, cache, 100);

    expect(await sweep.execute()).toEqual({ expired: 0, failed: 0 });
    expect(storage.deleted).toHaveLength(0);
  });

  it('honours the batch size', async () => {
    const small = new ExpireFramesPackagesUseCase(videos, storage, cache, 1);

    expect(await small.execute()).toEqual({ expired: 1, failed: 0 });
  });
});
