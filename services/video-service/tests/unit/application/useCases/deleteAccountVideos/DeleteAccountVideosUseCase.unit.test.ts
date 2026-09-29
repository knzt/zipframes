import { beforeEach, describe, expect, it } from 'vitest';

import { DeleteAccountVideosUseCase } from '../../../../../src/application/useCases/deleteAccountVideos/DeleteAccountVideosUseCase.js';
import {
  InMemoryObjectStorage,
  InMemoryVideoListCache,
  InMemoryVideoRepository,
} from '../../../../support/in-memory.js';
import { aVideo, OTHER_OWNER_ID, OWNER_ID } from '../../../../support/videos.js';

const ID_QUEUED = '00000000-0000-4000-8000-00000000000a';
const ID_DONE = '00000000-0000-4000-8000-00000000000b';
const ID_OTHER_OWNER = '00000000-0000-4000-8000-00000000000c';

let videos: InMemoryVideoRepository;
let storage: InMemoryObjectStorage;
let cache: InMemoryVideoListCache;
let deleteAccountVideos: DeleteAccountVideosUseCase;

beforeEach(() => {
  videos = new InMemoryVideoRepository().seed(
    aVideo('QUEUED', { id: ID_QUEUED }),
    aVideo('DONE', { id: ID_DONE }),
    aVideo('DONE', { id: ID_OTHER_OWNER, ownerId: OTHER_OWNER_ID }),
  );
  storage = new InMemoryObjectStorage();
  cache = new InMemoryVideoListCache();
  deleteAccountVideos = new DeleteAccountVideosUseCase(videos, storage, cache);
});

describe('DeleteAccountVideosUseCase', () => {
  it("purges every object and row of the owner's videos, whatever their status", async () => {
    await deleteAccountVideos.execute(OWNER_ID);

    expect(storage.deleted).toEqual(
      expect.arrayContaining([
        `uploads/${OWNER_ID}/${ID_QUEUED}`,
        `uploads/${OWNER_ID}/${ID_DONE}`,
        `outputs/${OWNER_ID}/${ID_DONE}.zip`,
      ]),
    );
    expect(videos.rows.has(ID_QUEUED)).toBe(false);
    expect(videos.rows.has(ID_DONE)).toBe(false);
  });

  it('leaves the other owners alone', async () => {
    await deleteAccountVideos.execute(OWNER_ID);

    expect(videos.rows.has(ID_OTHER_OWNER)).toBe(true);
    expect(storage.deleted).not.toContain(`uploads/${OTHER_OWNER_ID}/${ID_OTHER_OWNER}`);
  });

  it('invalidates the cache even for an owner with no videos', async () => {
    await deleteAccountVideos.execute(OTHER_OWNER_ID);

    expect(videos.rows.has(ID_OTHER_OWNER)).toBe(false);
    expect(cache.invalidated).toEqual([OTHER_OWNER_ID]);
  });

  it('lets a storage fault propagate instead of deleting the rows', async () => {
    storage.failDeleteWith = new Error('storage down');

    await expect(deleteAccountVideos.execute(OWNER_ID)).rejects.toThrow('storage down');

    expect(videos.rows.has(ID_QUEUED)).toBe(true);
  });

  it('lets a repository fault propagate', async () => {
    class FlakyRepository extends InMemoryVideoRepository {
      override deleteAllByOwner(): Promise<void> {
        return Promise.reject(new Error('db down'));
      }
    }
    const flaky = new FlakyRepository().seed(aVideo('DONE', { id: ID_DONE }));
    const flakyUseCase = new DeleteAccountVideosUseCase(flaky, storage, cache);

    await expect(flakyUseCase.execute(OWNER_ID)).rejects.toThrow('db down');
  });
});
