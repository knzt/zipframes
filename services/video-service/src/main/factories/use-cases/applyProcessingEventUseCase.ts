import type { VideoListCache } from '../../../application/interfaces/gateways/VideoListCache.js';
import { ApplyProcessingEventUseCase } from '../../../application/useCases/applyProcessingEvent/ApplyProcessingEventUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import { createVideoRepository } from '../repositories/videoRepository.js';

/** Clients and settings opened once in `start.ts` and reused for this use case. */
export interface ApplyProcessingEventExternalDeps {
  readonly prisma: Prisma;
  readonly videoListCache: VideoListCache;
  readonly retentionMs: number;
}

export const createApplyProcessingEventUseCase = (
  externalDeps: ApplyProcessingEventExternalDeps,
): ApplyProcessingEventUseCase =>
  new ApplyProcessingEventUseCase(
    createVideoRepository(externalDeps.prisma),
    externalDeps.videoListCache,
    externalDeps.retentionMs,
  );
