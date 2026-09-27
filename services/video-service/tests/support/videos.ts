import { Video, type PersistedVideo } from '../../src/domain/entities/video.js';
import { framesPackageKeyFor, sourceKeyFor } from '../../src/domain/policies/storageKeys.js';
import type { VideoStatus } from '../../src/domain/valueObjects/videoStatus.js';

export const OWNER_ID = '0194f3a0-0000-7000-8000-00000000a001';
export const OTHER_OWNER_ID = '0194f3a0-0000-7000-8000-00000000b002';
export const VIDEO_ID = '0194f3a0-0000-7000-8000-00000000c003';
export const CORRELATION_ID = '0194f3a0-0000-7000-8000-00000000d004';
export const CREATED_AT = new Date('2026-09-27T10:00:00.000Z');
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
export const RETENTION_MS = 24 * 60 * 60 * 1000;

/** Columns a video has in each status, so the builder only yields valid rows. */
const byStatus = (
  ownerId: string,
  videoId: string,
): Record<VideoStatus, Partial<PersistedVideo>> => ({
  AWAITING_UPLOAD: {},
  QUEUED: {},
  PROCESSING: {},
  DONE: {
    resultKey: framesPackageKeyFor(ownerId, videoId),
    frameCount: 12,
    expiresAt: new Date(CREATED_AT.getTime() + RETENTION_MS),
  },
  FAILED: { errorCode: 'UNSUPPORTED_MEDIA', failureReason: 'ffmpeg rejected the media file' },
  EXPIRED: { frameCount: 12, resultPurgedAt: CREATED_AT, sourcePurgedAt: CREATED_AT },
  DELETED: { sourcePurgedAt: CREATED_AT },
});

/** A stored video in `status`, with every other column overridable. */
export const aVideo = (
  status: VideoStatus = 'AWAITING_UPLOAD',
  overrides: Partial<PersistedVideo> = {},
): Video => {
  const id = overrides.id ?? VIDEO_ID;
  const ownerId = overrides.ownerId ?? OWNER_ID;
  return Video.fromPersistence({
    id,
    ownerId,
    originalFileName: 'aula.mp4',
    contentType: 'video/mp4',
    sizeBytes: 1024,
    sourceKey: sourceKeyFor(ownerId, id),
    resultKey: null,
    frameCount: null,
    status,
    errorCode: null,
    failureReason: null,
    expiresAt: null,
    sourcePurgedAt: null,
    resultPurgedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    version: 0,
    ...byStatus(ownerId, id)[status],
    ...overrides,
  });
};
