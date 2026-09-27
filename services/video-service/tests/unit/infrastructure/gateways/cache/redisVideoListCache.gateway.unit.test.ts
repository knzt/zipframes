import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';

import {
  listCacheKeyOf,
  RedisVideoListCacheGateway,
} from '../../../../../src/infrastructure/gateways/cache/redisVideoListCache.gateway.js';
import { aVideo, OWNER_ID } from '../../../../support/videos.js';

// DONE carries every date column, so the round trip covers all of them.
const item = aVideo('DONE', { sourcePurgedAt: new Date('2026-09-27T11:00:00.000Z') });

interface FakeRedis {
  readonly redis: Redis;
  readonly hashes: Map<string, Map<string, string>>;
  readonly expirations: Map<string, number>;
}

/** Just enough of ioredis for the gateway: a hash per key. */
const fakeRedis = (): FakeRedis => {
  const hashes = new Map<string, Map<string, string>>();
  const expirations = new Map<string, number>();
  const redis = {
    hget: (key: string, field: string) => Promise.resolve(hashes.get(key)?.get(field) ?? null),
    del: (key: string) => Promise.resolve(Number(hashes.delete(key))),
    multi: () => {
      const ops: (() => void)[] = [];
      const chain = {
        hset: (key: string, field: string, value: string) => {
          ops.push(() => {
            hashes.set(key, (hashes.get(key) ?? new Map<string, string>()).set(field, value));
          });
          return chain;
        },
        expire: (key: string, seconds: number) => {
          ops.push(() => {
            expirations.set(key, seconds);
          });
          return chain;
        },
        exec: () => {
          for (const op of ops) {
            op();
          }
          return Promise.resolve([]);
        },
      };
      return chain;
    },
  };
  return { redis: redis as unknown as Redis, hashes, expirations };
};

const brokenRedis = {
  hget: () => Promise.reject(new Error('down')),
  del: () => Promise.reject(new Error('down')),
  multi: () => ({
    hset() {
      return this;
    },
    expire() {
      return this;
    },
    exec: () => Promise.reject(new Error('down')),
  }),
} as unknown as Redis;

describe('RedisVideoListCacheGateway', () => {
  it('stores one field per page size under the owner key, with a TTL', async () => {
    const { redis, hashes, expirations } = fakeRedis();
    const cache = new RedisVideoListCacheGateway(redis, 60);

    await cache.set(OWNER_ID, 20, [item]);

    expect(hashes.get(listCacheKeyOf(OWNER_ID))?.get('20')).toBe(JSON.stringify([item.toJSON()]));
    expect(expirations.get(listCacheKeyOf(OWNER_ID))).toBe(60);
    expect((await cache.get(OWNER_ID, 20))?.map((video) => video.toJSON())).toEqual([
      item.toJSON(),
    ]);
    expect(await cache.get(OWNER_ID, 50)).toBeNull();
  });

  it('drops every page size of the owner at once', async () => {
    const { redis } = fakeRedis();
    const cache = new RedisVideoListCacheGateway(redis, 60);
    await cache.set(OWNER_ID, 20, [item]);
    await cache.set(OWNER_ID, 50, [item]);

    await cache.invalidate(OWNER_ID);

    expect(await cache.get(OWNER_ID, 20)).toBeNull();
    expect(await cache.get(OWNER_ID, 50)).toBeNull();
  });

  it('degrades to a miss and no-ops when Redis fails, reporting each failure', async () => {
    const onError = vi.fn();
    const cache = new RedisVideoListCacheGateway(brokenRedis, 60, onError);

    expect(await cache.get(OWNER_ID, 20)).toBeNull();
    await expect(cache.set(OWNER_ID, 20, [item])).resolves.toBeUndefined();
    await expect(cache.invalidate(OWNER_ID)).resolves.toBeUndefined();
    expect(onError.mock.calls.map(([operation]) => operation as string)).toEqual([
      'get',
      'set',
      'invalidate',
    ]);
  });

  it('works without an error callback', async () => {
    const cache = new RedisVideoListCacheGateway(brokenRedis, 60);

    expect(await cache.get(OWNER_ID, 20)).toBeNull();
  });
});
