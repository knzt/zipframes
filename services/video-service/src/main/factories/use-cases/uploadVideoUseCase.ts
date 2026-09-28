import type { EventPublisher } from '../../../application/interfaces/gateways/EventPublisher.js';
import type { VideoListCache } from '../../../application/interfaces/gateways/VideoListCache.js';
import { UploadVideoUseCase } from '../../../application/useCases/uploadVideo/UploadVideoUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import type { S3 } from '../externals/s3.js';
import { createObjectStorageGateway } from '../gateways/objectStorageGateway.js';
import { createVideoRepository } from '../repositories/videoRepository.js';

/** Clients and settings opened once in `start.ts` and reused for this use case. */
export interface UploadVideoExternalDeps {
  readonly prisma: Prisma;
  readonly s3: S3;
  readonly bucket: string;
  readonly eventPublisher: EventPublisher;
  readonly videoListCache: VideoListCache;
  readonly maxUploadBytes: number;
}

export const createUploadVideoUseCase = (
  externalDeps: UploadVideoExternalDeps,
): UploadVideoUseCase =>
  new UploadVideoUseCase(
    createVideoRepository(externalDeps.prisma),
    createObjectStorageGateway(externalDeps),
    externalDeps.eventPublisher,
    externalDeps.videoListCache,
    externalDeps.maxUploadBytes,
  );
