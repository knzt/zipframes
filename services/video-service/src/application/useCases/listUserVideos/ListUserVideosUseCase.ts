import { ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import type { VideoListCache } from '../../interfaces/gateways/VideoListCache.js';
import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';
import type {
  ListUserVideosUseCaseError,
  ListUserVideosUseCaseInput,
  ListUserVideosUseCaseOutput,
} from './listUserVideos.dto.js';

/**
 * The owner's videos, newest first. Only the first page is cached: it is the
 * one every status check reads, and every change to the owner's videos
 * invalidates it.
 */
export class ListUserVideosUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly videoListCache: VideoListCache,
  ) {}

  async execute(
    page: ListUserVideosUseCaseInput,
  ): Promise<Result<ListUserVideosUseCaseOutput, ListUserVideosUseCaseError>> {
    const firstPage = page.before === undefined;
    if (firstPage) {
      const cached = await this.videoListCache.get(page.ownerId, page.limit);
      if (cached !== null) {
        return ok({ items: cached });
      }
    }

    const videos = await this.videoRepository.listByOwner(page.ownerId, {
      limit: page.limit,
      ...(page.before !== undefined ? { before: page.before } : {}),
    });
    if (firstPage) {
      await this.videoListCache.set(page.ownerId, page.limit, videos);
    }
    return ok({ items: videos });
  }
}
