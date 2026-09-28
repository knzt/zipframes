import { GetDownloadUrlUseCase } from '../../../application/useCases/getDownloadUrl/GetDownloadUrlUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import type { S3 } from '../externals/s3.js';
import { createDownloadUrlSignerGateway } from '../gateways/downloadUrlSignerGateway.js';
import { createVideoRepository } from '../repositories/videoRepository.js';

/** Clients and settings opened once in `start.ts` and reused for this use case. */
export interface GetDownloadUrlExternalDeps {
  readonly prisma: Prisma;
  readonly publicS3: S3;
  readonly bucket: string;
  readonly downloadUrlTtlSeconds: number;
}

export const createGetDownloadUrlUseCase = (
  externalDeps: GetDownloadUrlExternalDeps,
): GetDownloadUrlUseCase =>
  new GetDownloadUrlUseCase(
    createVideoRepository(externalDeps.prisma),
    createDownloadUrlSignerGateway(externalDeps),
    externalDeps.downloadUrlTtlSeconds,
  );
