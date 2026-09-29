import type { Video } from '../../../domain/entities/video.js';
import type { ListableVideoStatus } from '../../../domain/valueObjects/videoStatus.js';

/**
 * Code of the `ConflictError` that `save` throws when the same video was
 * written by someone else between this read and this write — for instance
 * two worker events for one video handled at once, or an expiry racing a
 * deletion. It never comes from two owners: every upload is its own video.
 */
export const VIDEO_CHANGED_CONCURRENTLY = 'VIDEO_CHANGED_CONCURRENTLY';

export interface ListByOwnerQuery {
  readonly limit: number;
  /** Keyset cursor: only videos created strictly before this instant. */
  readonly before?: Date;
  /** Only videos in this status. */
  readonly status?: ListableVideoStatus;
}

export interface VideoRepository {
  /** Unscoped: for paths that already trust the id, such as a worker event. */
  readonly findById: (videoId: string) => Promise<Video | null>;
  /**
   * The video with this id, but only if `ownerId` owns it. `null` both when
   * it does not exist and when it belongs to someone else, so callers
   * cannot tell the two apart.
   */
  readonly findByIdForOwner: (videoId: string, ownerId: string) => Promise<Video | null>;
  /** Newest first, without deleted videos. */
  readonly listByOwner: (ownerId: string, query: ListByOwnerQuery) => Promise<readonly Video[]>;
  /** `DONE` videos whose retention ended at or before `now`, oldest first. */
  readonly findExpired: (now: Date, limit: number) => Promise<readonly Video[]>;
  /**
   * Stores a new video or a transition of one read earlier, and returns it
   * as stored. Throws a `ConflictError` with code
   * {@link VIDEO_CHANGED_CONCURRENTLY} when the stored copy changed since it
   * was read.
   */
  readonly save: (video: Video) => Promise<Video>;
}
