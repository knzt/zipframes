import type { VideoListCache } from '../../../application/interfaces/gateways/VideoListCache.js';
import { RequestUploadUseCase } from '../../../application/useCases/requestUpload/RequestUploadUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import type { S3 } from '../externals/s3.js';
import { createStorageUrlSignerGateway } from '../gateways/storageUrlSignerGateway.js';
import { createVideoRepository } from '../repositories/videoRepository.js';

/** Clients and settings opened once in `start.ts` and reused for this use case. */
export interface RequestUploadExternalDeps {
  readonly prisma: Prisma;
  readonly publicS3: S3;
  readonly bucket: string;
  readonly videoListCache: VideoListCache;
  readonly maxUploadBytes: number;
  readonly uploadUrlTtlSeconds: number;
}

export const createRequestUploadUseCase = (
  externalDeps: RequestUploadExternalDeps,
): RequestUploadUseCase =>
  new RequestUploadUseCase(
    createVideoRepository(externalDeps.prisma),
    createStorageUrlSignerGateway(externalDeps),
    externalDeps.videoListCache,
    externalDeps.maxUploadBytes,
    externalDeps.uploadUrlTtlSeconds,
  );
