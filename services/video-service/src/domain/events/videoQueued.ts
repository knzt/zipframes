import type { Video } from '../entities/video.js';

/**
 * The only fact this context publishes: the file is stored and the video is
 * waiting for the worker. It travels as `video.uploaded`.
 */
export interface VideoQueued {
  readonly videoId: string;
  readonly ownerId: string;
  readonly sourceKey: string;
  readonly originalFileName: string;
  readonly sizeBytes: number;
}

export const videoQueuedFrom = (video: Video): VideoQueued => ({
  videoId: video.id,
  ownerId: video.ownerId,
  sourceKey: video.sourceKey,
  originalFileName: video.originalFileName,
  sizeBytes: video.sizeBytes,
});
