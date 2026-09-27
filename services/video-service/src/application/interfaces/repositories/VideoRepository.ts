import type { Video } from '../../../domain/entities/video.js';

/** Code of the `ConflictError` that `save` throws when the row changed since it was read. */
export const CONCURRENT_VIDEO_UPDATE = 'VIDEO_CONCURRENT_UPDATE';

export interface ListByOwnerQuery {
  readonly limit: number;
  /** Keyset cursor: only videos created strictly before this instant. */
  readonly before?: Date;
}

export interface VideoRepository {
  readonly create: (video: Video) => Promise<void>;
  /** Unscoped: for paths that already trust the id, such as an event carrying no owner. */
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
   * Writes a transition of a video read earlier. Throws a `ConflictError`
   * with code {@link CONCURRENT_VIDEO_UPDATE} when someone else wrote it in
   * between (optimistic lock on `version`).
   */
  readonly save: (video: Video) => Promise<void>;
}
