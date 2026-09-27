import type { Video } from '../../../domain/entities/video.js';
import type { ObjectStorage } from '../../interfaces/gateways/ObjectStorage.js';
import type { VideoListCache } from '../../interfaces/gateways/VideoListCache.js';
import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';

export interface ExpireFramesPackagesUseCaseOutput {
  readonly expired: number;
  readonly failed: number;
}

/**
 * Retention sweep: deletes the frames packages whose window ended and moves
 * their videos to `EXPIRED`.
 *
 * One failing video does not stop the batch; it stays `DONE` and the next
 * sweep picks it up again. Replicas may sweep at the same time: deleting an
 * object twice is harmless and the optimistic lock lets one write win.
 */
export class ExpireFramesPackagesUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly objectStorage: ObjectStorage,
    private readonly videoListCache: VideoListCache,
    private readonly batchSize: number,
    private readonly onExpireFailed?: (videoId: string, error: unknown) => void,
  ) {}

  async execute(): Promise<ExpireFramesPackagesUseCaseOutput> {
    const now = new Date();
    const candidates = await this.videoRepository.findExpired(now, this.batchSize);

    let expired = 0;
    let failed = 0;
    for (const video of candidates) {
      try {
        if (await this.expireOne(video, now)) {
          expired += 1;
        }
      } catch (error) {
        failed += 1;
        this.onExpireFailed?.(video.id, error);
      }
    }
    return { expired, failed };
  }

  private async expireOne(video: Video, now: Date): Promise<boolean> {
    const next = video.expire(now);
    if (!next.ok) {
      return false;
    }
    for (const key of video.objectKeysToPurge()) {
      await this.objectStorage.deleteObject(key);
    }
    await this.videoRepository.save(next.value);
    await this.videoListCache.invalidate(video.ownerId);
    return true;
  }
}
