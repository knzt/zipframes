import { describe, expect, it } from 'vitest';

import { Video, type ProcessingEvent } from '../../../../src/domain/entities/video.js';
import {
  InvalidVideoTransitionError,
  UploadNotFoundError,
} from '../../../../src/domain/errors/videoErrors.js';
import { framesPackageKeyFor } from '../../../../src/domain/policies/storageKeys.js';
import type { VideoStatus } from '../../../../src/domain/valueObjects/videoStatus.js';
import {
  aVideo,
  CREATED_AT,
  MAX_UPLOAD_BYTES,
  OTHER_OWNER_ID,
  OWNER_ID,
  RETENTION_MS,
  VIDEO_ID,
} from '../../../support/videos.js';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const LATER = new Date('2026-09-27T12:05:00.000Z');

const request = {
  ownerId: OWNER_ID,
  originalFileName: 'aula.mp4',
  contentType: 'video/mp4',
  sizeBytes: 2048,
  maxSizeBytes: MAX_UPLOAD_BYTES,
  now: NOW,
};

const started: ProcessingEvent = { kind: 'started' };
const completed: ProcessingEvent = {
  kind: 'completed',
  resultKey: framesPackageKeyFor(OWNER_ID, VIDEO_ID),
  frameCount: 30,
};
const failed: ProcessingEvent = {
  kind: 'failed',
  errorCode: 'UNSUPPORTED_MEDIA',
  reason: 'ffmpeg rejected the media file',
};

const applied = (status: VideoStatus, event: ProcessingEvent): Video => {
  const outcome = aVideo(status).applyProcessingEvent(event, {
    retentionMs: RETENTION_MS,
    now: LATER,
  });
  if (outcome.kind !== 'applied') {
    throw new Error(`expected the event to apply, got ${outcome.reason}`);
  }
  return outcome.video;
};

describe('Video.requestUpload', () => {
  it('opens a video waiting for its file, with keys derived from owner and id', () => {
    const result = Video.requestUpload({ ...request, id: VIDEO_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toJSON()).toEqual({
      id: VIDEO_ID,
      ownerId: OWNER_ID,
      originalFileName: 'aula.mp4',
      contentType: 'video/mp4',
      sizeBytes: 2048,
      sourceKey: `uploads/${OWNER_ID}/${VIDEO_ID}`,
      resultKey: null,
      frameCount: null,
      status: 'AWAITING_UPLOAD',
      errorCode: null,
      failureReason: null,
      expiresAt: null,
      sourcePurgedAt: null,
      resultPurgedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
      version: 0,
    });
  });

  it('generates a UUID when no id is given', () => {
    const result = Video.requestUpload(request);

    expect(result.ok && result.value.id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('rejects a file extension the context does not accept', () => {
    expect(Video.requestUpload({ ...request, originalFileName: 'foto.png' })).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_EXTENSION' },
    });
  });

  it.each(['', 'video', 'video/mp4; codecs=avc1', `video/${'x'.repeat(100)}`])(
    'rejects the content type %j',
    (contentType) => {
      expect(Video.requestUpload({ ...request, contentType })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_CONTENT_TYPE' },
      });
    },
  );

  it.each([0, -1, 1.5, Number.NaN])('rejects the size %d', (sizeBytes) => {
    expect(Video.requestUpload({ ...request, sizeBytes })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_FILE_SIZE' },
    });
  });

  it('rejects a declared size above the limit and accepts one exactly at it', () => {
    expect(Video.requestUpload({ ...request, sizeBytes: MAX_UPLOAD_BYTES + 1 })).toMatchObject({
      ok: false,
      error: { code: 'FILE_TOO_LARGE' },
    });
    expect(Video.requestUpload({ ...request, sizeBytes: MAX_UPLOAD_BYTES }).ok).toBe(true);
  });
});

describe('Video.confirmUpload', () => {
  const confirm = (
    video: Video,
    storedObject: { sizeBytes: number } | null,
  ): ReturnType<Video['confirmUpload']> =>
    video.confirmUpload({ storedObject, maxSizeBytes: MAX_UPLOAD_BYTES, now: LATER });

  it('queues the video and records the size the storage holds', () => {
    const result = confirm(aVideo('AWAITING_UPLOAD'), { sizeBytes: 4096 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('QUEUED');
    expect(result.value.sizeBytes).toBe(4096);
    expect(result.value.updatedAt).toEqual(LATER);
    expect(result.value.version).toBe(0);
  });

  it('refuses a video that is no longer waiting for its upload', () => {
    const result = confirm(aVideo('QUEUED'), { sizeBytes: 4096 });

    expect(result).toMatchObject({ ok: false });
    expect(!result.ok && result.error).toBeInstanceOf(InvalidVideoTransitionError);
  });

  it('checks the status before the storage, so a queued video is never "not uploaded"', () => {
    const result = confirm(aVideo('DONE'), null);

    expect(!result.ok && result.error).toBeInstanceOf(InvalidVideoTransitionError);
  });

  it('refuses when nothing reached the storage', () => {
    const result = confirm(aVideo('AWAITING_UPLOAD'), null);

    expect(!result.ok && result.error).toBeInstanceOf(UploadNotFoundError);
  });

  it('refuses an empty or oversized stored file', () => {
    expect(confirm(aVideo(), { sizeBytes: 0 })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_FILE_SIZE' },
    });
    expect(confirm(aVideo(), { sizeBytes: MAX_UPLOAD_BYTES + 1 })).toMatchObject({
      ok: false,
      error: { code: 'FILE_TOO_LARGE' },
    });
  });
});

describe('Video.applyProcessingEvent', () => {
  it('moves QUEUED to PROCESSING when the worker starts', () => {
    expect(applied('QUEUED', started).status).toBe('PROCESSING');
  });

  it.each<VideoStatus>(['QUEUED', 'PROCESSING'])(
    'moves %s to DONE with the package, the frame count and a 24h window',
    (status) => {
      const video = applied(status, completed);

      expect(video.toJSON()).toMatchObject({
        status: 'DONE',
        resultKey: framesPackageKeyFor(OWNER_ID, VIDEO_ID),
        frameCount: 30,
        expiresAt: new Date(LATER.getTime() + RETENTION_MS),
        updatedAt: LATER,
      });
    },
  );

  it.each<VideoStatus>(['QUEUED', 'PROCESSING'])('moves %s to FAILED with the reason', (status) => {
    expect(applied(status, failed).toJSON()).toMatchObject({
      status: 'FAILED',
      errorCode: 'UNSUPPORTED_MEDIA',
      failureReason: 'ffmpeg rejected the media file',
    });
  });

  it('truncates an error code longer than the column', () => {
    const video = applied('PROCESSING', { ...failed, errorCode: 'E'.repeat(80) });

    expect(video.toJSON().errorCode).toHaveLength(50);
  });

  it.each<[VideoStatus, ProcessingEvent]>([
    ['DONE', started],
    ['DONE', completed],
    ['DONE', failed],
    ['FAILED', started],
    ['FAILED', completed],
    ['EXPIRED', completed],
    ['DELETED', failed],
  ])('ignores events once processing is over (%s ← %j)', (status, event) => {
    const outcome = aVideo(status).applyProcessingEvent(event, {
      retentionMs: RETENTION_MS,
      now: LATER,
    });

    expect(outcome).toEqual({ kind: 'ignored', reason: 'processing_finished' });
  });

  it('ignores a repeated start', () => {
    expect(
      aVideo('PROCESSING').applyProcessingEvent(started, { retentionMs: RETENTION_MS, now: LATER }),
    ).toEqual({ kind: 'ignored', reason: 'already_processing' });
  });

  it('reports an event for a video that was never queued', () => {
    expect(
      aVideo('AWAITING_UPLOAD').applyProcessingEvent(completed, {
        retentionMs: RETENTION_MS,
        now: LATER,
      }),
    ).toEqual({ kind: 'ignored', reason: 'not_queued' });
  });

  it('never accepts a package key that belongs to another video', () => {
    const outcome = aVideo('PROCESSING').applyProcessingEvent(
      { ...completed, resultKey: framesPackageKeyFor(OTHER_OWNER_ID, VIDEO_ID) },
      { retentionMs: RETENTION_MS, now: LATER },
    );

    expect(outcome).toEqual({ kind: 'ignored', reason: 'foreign_result_key' });
  });
});

describe('Video.downloadAvailability', () => {
  const expiresAt = new Date(CREATED_AT.getTime() + RETENTION_MS);

  it('is available while the retention window is open', () => {
    expect(aVideo('DONE').downloadAvailability(new Date(expiresAt.getTime() - 1))).toEqual({
      kind: 'available',
      resultKey: framesPackageKeyFor(OWNER_ID, VIDEO_ID),
    });
  });

  it('is gone once the window closed, even before the sweep runs', () => {
    expect(aVideo('DONE').downloadAvailability(expiresAt)).toEqual({ kind: 'gone' });
  });

  it.each<VideoStatus>(['EXPIRED', 'DELETED'])('is gone for %s', (status) => {
    expect(aVideo(status).downloadAvailability(NOW)).toEqual({ kind: 'gone' });
  });

  it.each<VideoStatus>(['AWAITING_UPLOAD', 'QUEUED', 'PROCESSING', 'FAILED'])(
    'is not ready for %s',
    (status) => {
      expect(aVideo(status).downloadAvailability(NOW)).toEqual({ kind: 'not_ready' });
    },
  );
});

describe('Video.expire', () => {
  const expiresAt = new Date(CREATED_AT.getTime() + RETENTION_MS);

  it('ends the window: EXPIRED, no package key, both purges recorded', () => {
    const result = aVideo('DONE').expire(expiresAt);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.toJSON()).toMatchObject({
      status: 'EXPIRED',
      resultKey: null,
      resultPurgedAt: expiresAt,
      sourcePurgedAt: expiresAt,
    });
  });

  it('keeps an earlier source purge date', () => {
    const purgedAt = new Date('2026-09-27T10:30:00.000Z');
    const result = aVideo('DONE', { sourcePurgedAt: purgedAt }).expire(expiresAt);

    expect(result.ok && result.value.toJSON().sourcePurgedAt).toEqual(purgedAt);
  });

  it('refuses before the window ends or outside DONE', () => {
    expect(aVideo('DONE').expire(new Date(expiresAt.getTime() - 1)).ok).toBe(false);
    expect(aVideo('FAILED').expire(expiresAt).ok).toBe(false);
  });
});

describe('Video.delete', () => {
  it.each<VideoStatus>(['AWAITING_UPLOAD', 'DONE', 'FAILED', 'EXPIRED'])(
    'deletes from %s, dropping the package key',
    (status) => {
      const result = aVideo(status).delete(LATER);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.status).toBe('DELETED');
      expect(result.value.resultKey).toBeNull();
    },
  );

  it('records when each file was purged', () => {
    const result = aVideo('DONE').delete(LATER);

    expect(result.ok && result.value.toJSON()).toMatchObject({
      sourcePurgedAt: LATER,
      resultPurgedAt: LATER,
    });
  });

  it('keeps the purge dates it already had', () => {
    const result = aVideo('EXPIRED').delete(LATER);

    expect(result.ok && result.value.toJSON()).toMatchObject({
      sourcePurgedAt: CREATED_AT,
      resultPurgedAt: CREATED_AT,
    });
  });

  it.each<VideoStatus>(['QUEUED', 'PROCESSING', 'DELETED'])('refuses %s', (status) => {
    const result = aVideo(status).delete(LATER);

    expect(!result.ok && result.error).toBeInstanceOf(InvalidVideoTransitionError);
    expect(!result.ok && result.error.message).toBe(`cannot delete a video in ${status}`);
  });
});

describe('Video.objectKeysToPurge', () => {
  it('lists the source until it is purged, and the package while it exists', () => {
    expect(aVideo('AWAITING_UPLOAD').objectKeysToPurge()).toEqual([
      `uploads/${OWNER_ID}/${VIDEO_ID}`,
    ]);
    expect(aVideo('DONE').objectKeysToPurge()).toEqual([
      `uploads/${OWNER_ID}/${VIDEO_ID}`,
      framesPackageKeyFor(OWNER_ID, VIDEO_ID),
    ]);
    expect(aVideo('EXPIRED').objectKeysToPurge()).toEqual([]);
  });
});

describe('Video accessors', () => {
  it('exposes what the views and the event need', () => {
    const video = aVideo('FAILED');

    expect({
      contentType: video.contentType,
      failureReason: video.failureReason,
      frameCount: video.frameCount,
      expiresAt: video.expiresAt,
    }).toEqual({
      contentType: 'video/mp4',
      failureReason: 'ffmpeg rejected the media file',
      frameCount: null,
      expiresAt: null,
    });
  });
});
