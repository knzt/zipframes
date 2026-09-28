import type { Logger } from '@zipframes/logger';

import { RedisVideoListCacheGateway } from '../../../infrastructure/gateways/cache/redisVideoListCache.gateway.js';
import type { RedisClient } from '../externals/redis.js';

export interface VideoListCacheGatewayDeps {
  readonly redis: RedisClient;
  readonly ttlSeconds: number;
  readonly logger: Logger;
}

export const createVideoListCacheGateway = ({
  redis,
  ttlSeconds,
  logger,
}: VideoListCacheGatewayDeps): RedisVideoListCacheGateway =>
  new RedisVideoListCacheGateway(redis, ttlSeconds, (operation, error) => {
    logger.debug('video list cache operation failed', { operation, err: error });
  });
