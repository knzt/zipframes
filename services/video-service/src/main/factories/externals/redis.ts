import { Redis } from 'ioredis';

import type { Logger } from '@zipframes/logger';

const CONNECT_TIMEOUT_MS = 2_000;

/**
 * Fails fast instead of queueing: while Redis is away a command errors at
 * once and the cache answers a miss. The client keeps reconnecting in the
 * background; only changes of state are logged, not every retry.
 */
export const createRedis = (url: string, logger: Logger): Redis => {
  const redis = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: CONNECT_TIMEOUT_MS,
  });

  let available = true;
  redis.on('error', (error: unknown) => {
    if (available) {
      available = false;
      logger.warn('redis unavailable; listing falls back to the database', { err: error });
    }
  });
  redis.on('ready', () => {
    if (!available) {
      available = true;
      logger.info('redis available again');
    }
  });

  return redis;
};

export type RedisClient = ReturnType<typeof createRedis>;
