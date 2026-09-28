import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';
import { VideoNotFoundError } from '../../errors/VideoNotFoundError.js';
import type {
  GetVideoUseCaseError,
  GetVideoUseCaseInput,
  GetVideoUseCaseOutput,
} from './getVideo.dto.js';

export class GetVideoUseCase {
  constructor(private readonly videoRepository: VideoRepository) {}

  async execute(
    lookup: GetVideoUseCaseInput,
  ): Promise<Result<GetVideoUseCaseOutput, GetVideoUseCaseError>> {
    const video = await this.videoRepository.findByIdForOwner(lookup.videoId, lookup.ownerId);
    if (video === null) {
      return err(new VideoNotFoundError());
    }
    return ok(video);
  }
}
