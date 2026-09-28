import type { VideoListCache } from '../../../application/interfaces/gateways/VideoListCache.js';
import { ExpireFramesPackagesUseCase } from '../../../application/useCases/expireFramesPackages/ExpireFramesPackagesUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import type { S3 } from '../externals/s3.js';
import { createObjectStorageGateway } from '../gateways/objectStorageGateway.js';
import { createVideoRepository } from '../repositories/videoRepository.js';

/** Clients and settings opened once in `start.ts` and reused for this use case. */
export interface ExpireFramesPackagesExternalDeps {
  readonly prisma: Prisma;
  readonly s3: S3;
  readonly bucket: string;
  readonly videoListCache: VideoListCache;
  readonly expirationBatchSize: number;
  readonly onExpireFailed?: (videoId: string, error: unknown) => void;
}

export const createExpireFramesPackagesUseCase = (
  externalDeps: ExpireFramesPackagesExternalDeps,
): ExpireFramesPackagesUseCase =>
  new ExpireFramesPackagesUseCase(
    createVideoRepository(externalDeps.prisma),
    createObjectStorageGateway(externalDeps),
    externalDeps.videoListCache,
    externalDeps.expirationBatchSize,
    externalDeps.onExpireFailed,
  );
