import { beforeEach, describe, expect, it } from 'vitest';

import { ListUserVideosUseCase } from '../../../../../src/application/useCases/listUserVideos/ListUserVideosUseCase.js';
import { InMemoryVideoListCache, InMemoryVideoRepository } from '../../../../support/in-memory.js';
import { aVideo, OTHER_OWNER_ID, OWNER_ID } from '../../../../support/videos.js';

const at = (minute: number): Date => new Date(Date.UTC(2026, 8, 27, 10, minute));

let videos: InMemoryVideoRepository;
let cache: InMemoryVideoListCache;
let listUserVideos: ListUserVideosUseCase;

beforeEach(() => {
  videos = new InMemoryVideoRepository().seed(
    aVideo('DONE', { id: '00000000-0000-4000-8000-000000000001', createdAt: at(1) }),
    aVideo('FAILED', { id: '00000000-0000-4000-8000-000000000002', createdAt: at(2) }),
    aVideo('QUEUED', { id: '00000000-0000-4000-8000-000000000003', createdAt: at(3) }),
    aVideo('DELETED', { id: '00000000-0000-4000-8000-000000000004', createdAt: at(4) }),
    aVideo('DONE', {
      id: '00000000-0000-4000-8000-000000000005',
      ownerId: OTHER_OWNER_ID,
      createdAt: at(5),
    }),
  );
  cache = new InMemoryVideoListCache();
  listUserVideos = new ListUserVideosUseCase(videos, cache);
});

const idsOf = (result: Awaited<ReturnType<ListUserVideosUseCase['execute']>>): string[] =>
  result.ok ? result.value.items.map((video) => video.id) : [];

describe('ListUserVideosUseCase', () => {
  it("lists only the owner's videos, newest first, without deleted ones", async () => {
    const result = await listUserVideos.execute({ ownerId: OWNER_ID, limit: 10 });

    expect(idsOf(result)).toEqual([
      '00000000-0000-4000-8000-000000000003',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    ]);
  });

  it('keeps only the videos in the requested status', async () => {
    const result = await listUserVideos.execute({ ownerId: OWNER_ID, limit: 10, status: 'DONE' });

    expect(idsOf(result)).toEqual(['00000000-0000-4000-8000-000000000001']);
  });

  it('caches a filtered first page apart from the unfiltered one', async () => {
    await listUserVideos.execute({ ownerId: OWNER_ID, limit: 10, status: 'FAILED' });

    const all = await listUserVideos.execute({ ownerId: OWNER_ID, limit: 10 });

    expect(idsOf(all)).toHaveLength(3);
    expect(cache.pages.size).toBe(2);
  });

  it('pages with `before` set to the last createdAt seen', async () => {
    const first = await listUserVideos.execute({ ownerId: OWNER_ID, limit: 2 });
    const second = await listUserVideos.execute({ ownerId: OWNER_ID, limit: 2, before: at(2) });

    expect(idsOf(first)).toHaveLength(2);
    expect(idsOf(second)).toEqual(['00000000-0000-4000-8000-000000000001']);
  });

  it('answers the first page from the cache once it is filled', async () => {
    await listUserVideos.execute({ ownerId: OWNER_ID, limit: 10 });
    videos.rows.clear();

    const cached = await listUserVideos.execute({ ownerId: OWNER_ID, limit: 10 });

    expect(idsOf(cached)).toHaveLength(3);
  });

  it('never caches or reads the cache for later pages', async () => {
    await listUserVideos.execute({ ownerId: OWNER_ID, limit: 10, before: at(3) });

    expect(cache.pages.size).toBe(0);
  });
});
