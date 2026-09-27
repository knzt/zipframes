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
  readonly findById: (videoId: string) => Promise<Video | null>;
  /**
   * The owner's video with this id. `null` both when it does not exist and
   * when it belongs to someone else, so callers cannot tell the two apart.
   */
  readonly findByOwnerId: (ownerId: string, videoId: string) => Promise<Video | null>;
  /** Newest first, without deleted videos. */
  readonly listByOwner: (ownerId: string, query: ListByOwnerQuery) => Promise<readonly Video[]>;
  /** `DONE` videos whose retention ended at or before `now`, oldest first. */
  readonly findExpired: (now: Date, limit: number) => Promise<readonly Video[]>;
  /**
   * Writes a transition of a video read earlier. Throws a `ConflictError`
   * with code {@link CONCURRENT_VIDEO_UPDATE} when someone else wrote it in
   * between (optimistic lock on `version`).
   *
   * `beforeCommit` runs inside the same transaction, after the write. If it
   * throws, nothing is stored and the error propagates.
   */
  readonly save: (video: Video, beforeCommit?: () => Promise<void>) => Promise<void>;
}
