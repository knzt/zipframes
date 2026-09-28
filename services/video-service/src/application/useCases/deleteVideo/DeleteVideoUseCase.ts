import { ConflictError, err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { VideoNotFoundError } from '../../errors/VideoNotFoundError.js';
import type { ObjectStorage } from '../../interfaces/gateways/ObjectStorage.js';
import type { VideoListCache } from '../../interfaces/gateways/VideoListCache.js';
import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';
import type {
  DeleteVideoUseCaseError,
  DeleteVideoUseCaseInput,
  DeleteVideoUseCaseOutput,
} from './deleteVideo.dto.js';

/**
 * Deletes a video at the owner's request: the files first, then the status.
 * If a file cannot be removed nothing is marked, so the owner can retry
 * instead of ending with a `DELETED` video whose file still exists.
 */
export class DeleteVideoUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly objectStorage: ObjectStorage,
    private readonly videoListCache: VideoListCache,
  ) {}

  async execute(
    deletion: DeleteVideoUseCaseInput,
  ): Promise<Result<DeleteVideoUseCaseOutput, DeleteVideoUseCaseError>> {
    const video = await this.videoRepository.findByIdForOwner(deletion.videoId, deletion.ownerId);
    if (video === null) {
      return err(new VideoNotFoundError());
    }
    if (video.status === 'DELETED') {
      return ok(undefined);
    }

    const deleted = video.delete(new Date());
    if (!deleted.ok) {
      return err(
        new ConflictError(
          'VIDEO_IN_PROCESSING',
          'the video is being processed; delete it once processing ends',
        ),
      );
    }

    for (const key of video.objectKeysToPurge()) {
      await this.objectStorage.deleteObject(key);
    }
    await this.videoRepository.save(deleted.value);
    await this.videoListCache.invalidate(video.ownerId);

    return ok(undefined);
  }
}
