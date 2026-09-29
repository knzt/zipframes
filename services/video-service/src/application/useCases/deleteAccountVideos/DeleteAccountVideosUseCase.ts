import type { ObjectStorage } from '../../interfaces/gateways/ObjectStorage.js';
import type { VideoListCache } from '../../interfaces/gateways/VideoListCache.js';
import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';

/**
 * Removes every video and file of a deleted account, in any status. Reacts
 * to `user.deleted`, published once the owner no longer exists in
 * auth-service; there is no owner left to authorize this against.
 *
 * A video still `QUEUED` or `PROCESSING` is purged like any other: the
 * worker may still publish an event about it, and `ApplyProcessingEventUseCase`
 * already treats an unknown video as nothing to retry for.
 *
 * Infrastructure faults are not caught: they throw, so the message this
 * runs from is retried instead of leaving files or rows behind. Retrying
 * re-deletes objects already gone, which is harmless.
 */
export class DeleteAccountVideosUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly objectStorage: ObjectStorage,
    private readonly videoListCache: VideoListCache,
  ) {}

  async execute(ownerId: string): Promise<void> {
    const videos = await this.videoRepository.listAllByOwner(ownerId);
    for (const video of videos) {
      for (const key of video.objectKeysToPurge()) {
        await this.objectStorage.deleteObject(key);
      }
    }
    await this.videoRepository.deleteAllByOwner(ownerId);
    await this.videoListCache.invalidate(ownerId);
  }
}
