import type { VideoListCache } from '../../../application/interfaces/gateways/VideoListCache.js';
import { DeleteAccountVideosUseCase } from '../../../application/useCases/deleteAccountVideos/DeleteAccountVideosUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import type { S3 } from '../externals/s3.js';
import { createObjectStorageGateway } from '../gateways/objectStorageGateway.js';
import { createVideoRepository } from '../repositories/videoRepository.js';

/** Clients opened once in `start.ts` and reused for this use case. */
export interface DeleteAccountVideosExternalDeps {
  readonly prisma: Prisma;
  readonly s3: S3;
  readonly bucket: string;
  readonly videoListCache: VideoListCache;
}

export const createDeleteAccountVideosUseCase = (
  externalDeps: DeleteAccountVideosExternalDeps,
): DeleteAccountVideosUseCase =>
  new DeleteAccountVideosUseCase(
    createVideoRepository(externalDeps.prisma),
    createObjectStorageGateway(externalDeps),
    externalDeps.videoListCache,
  );
