import type { VideoListCache } from '../../../application/interfaces/gateways/VideoListCache.js';
import { ListUserVideosUseCase } from '../../../application/useCases/listUserVideos/ListUserVideosUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import { createVideoRepository } from '../repositories/videoRepository.js';

/** Clients opened once in `start.ts` and reused for this use case. */
export interface ListUserVideosExternalDeps {
  readonly prisma: Prisma;
  readonly videoListCache: VideoListCache;
}

export const createListUserVideosUseCase = (
  externalDeps: ListUserVideosExternalDeps,
): ListUserVideosUseCase =>
  new ListUserVideosUseCase(
    createVideoRepository(externalDeps.prisma),
    externalDeps.videoListCache,
  );
