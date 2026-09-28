import type { Video } from '../../../domain/entities/video.js';

/**
 * Cache-aside for the first page of an owner's list. Never the source of
 * truth: an implementation that cannot reach its store answers a miss and
 * swallows writes, so the list still comes from the database.
 */
export interface VideoListCache {
  readonly get: (ownerId: string, limit: number) => Promise<readonly Video[] | null>;
  readonly set: (ownerId: string, limit: number, videos: readonly Video[]) => Promise<void>;
  /** Drops every cached page of the owner. Called after any change to their videos. */
  readonly invalidate: (ownerId: string) => Promise<void>;
}
