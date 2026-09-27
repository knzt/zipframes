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
    query: GetVideoUseCaseInput,
  ): Promise<Result<GetVideoUseCaseOutput, GetVideoUseCaseError>> {
    const video = await this.videoRepository.findByOwnerId(query.ownerId, query.videoId);
    if (video === null) {
      return err(new VideoNotFoundError());
    }
    return ok(video);
  }
}
