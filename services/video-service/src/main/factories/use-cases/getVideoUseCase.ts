import { GetVideoUseCase } from '../../../application/useCases/getVideo/GetVideoUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import { createVideoRepository } from '../repositories/videoRepository.js';

/** Clients opened once in `start.ts` and reused for this use case. */
export interface GetVideoExternalDeps {
  readonly prisma: Prisma;
}

export const createGetVideoUseCase = (externalDeps: GetVideoExternalDeps): GetVideoUseCase =>
  new GetVideoUseCase(createVideoRepository(externalDeps.prisma));
