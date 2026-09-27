import type { Redis } from 'ioredis';

import type { VideoListCache } from '../../../application/interfaces/gateways/VideoListCache.js';
import { Video, type PersistedVideo } from '../../../domain/entities/video.js';

export type CacheOperation = 'get' | 'set' | 'invalidate';

/** One hash per owner, one field per page size: invalidating is a single DEL. */
export const listCacheKeyOf = (ownerId: string): string => `video-service:videos:${ownerId}`;

type CachedVideo = Omit<
  PersistedVideo,
  'expiresAt' | 'sourcePurgedAt' | 'resultPurgedAt' | 'createdAt' | 'updatedAt'
> & {
  readonly expiresAt: string | null;
  readonly sourcePurgedAt: string | null;
  readonly resultPurgedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

const dateOrNull = (value: string | null): Date | null => (value === null ? null : new Date(value));

/** JSON turned the dates into strings; the aggregate expects `Date`. */
const fromCached = (cached: CachedVideo): Video =>
  Video.fromPersistence({
    ...cached,
    expiresAt: dateOrNull(cached.expiresAt),
    sourcePurgedAt: dateOrNull(cached.sourcePurgedAt),
    resultPurgedAt: dateOrNull(cached.resultPurgedAt),
    createdAt: new Date(cached.createdAt),
    updatedAt: new Date(cached.updatedAt),
  });

/**
 * Cache-aside on Redis. Every failure degrades to a miss or a no-op and is
 * reported through `onError`: the database answers when Redis cannot.
 */
export class RedisVideoListCacheGateway implements VideoListCache {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
    private readonly onError?: (operation: CacheOperation, error: unknown) => void,
  ) {}

  async get(ownerId: string, limit: number): Promise<readonly Video[] | null> {
    try {
      const cached = await this.redis.hget(listCacheKeyOf(ownerId), String(limit));
      return cached === null ? null : (JSON.parse(cached) as CachedVideo[]).map(fromCached);
    } catch (error) {
      this.onError?.('get', error);
      return null;
    }
  }

  async set(ownerId: string, limit: number, videos: readonly Video[]): Promise<void> {
    const key = listCacheKeyOf(ownerId);
    try {
      await this.redis
        .multi()
        .hset(key, String(limit), JSON.stringify(videos.map((video) => video.toJSON())))
        .expire(key, this.ttlSeconds)
        .exec();
    } catch (error) {
      this.onError?.('set', error);
    }
  }

  async invalidate(ownerId: string): Promise<void> {
    try {
      await this.redis.del(listCacheKeyOf(ownerId));
    } catch (error) {
      this.onError?.('invalidate', error);
    }
  }
}
