import type { VideoListItem } from '@zipframes/schemas/video-service';

import type { Video } from '../domain/entities/video.js';

/** How a video is shown to its owner: status and outcome, never storage keys. */
export const toVideoListItem = (video: Video): VideoListItem => ({
  videoId: video.id,
  originalFileName: video.originalFileName,
  status: video.status,
  frameCount: video.frameCount,
  failureReason: video.failureReason,
  expiresAt: video.expiresAt?.toISOString() ?? null,
  createdAt: video.createdAt.toISOString(),
  updatedAt: video.updatedAt.toISOString(),
});
