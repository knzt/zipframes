import { videoService } from '@zipframes/schemas';
import { describe, expect, it } from 'vitest';

import { toVideoListItem } from '../../../src/interface-adapters/videoPresenter.js';
import { aVideo, VIDEO_ID } from '../../support/videos.js';

describe('toVideoListItem', () => {
  it('shows status and outcome in ISO dates, never storage keys', () => {
    const item = toVideoListItem(aVideo('DONE'));

    expect(item).toEqual({
      videoId: VIDEO_ID,
      originalFileName: 'aula.mp4',
      status: 'DONE',
      frameCount: 12,
      failureReason: null,
      expiresAt: '2026-09-28T10:00:00.000Z',
      createdAt: '2026-09-27T10:00:00.000Z',
      updatedAt: '2026-09-27T10:00:00.000Z',
    });
    expect(JSON.stringify(item)).not.toContain('outputs/');
  });

  it('keeps the failure reason and a null expiry for a failed video', () => {
    expect(toVideoListItem(aVideo('FAILED'))).toMatchObject({
      status: 'FAILED',
      failureReason: 'ffmpeg rejected the media file',
      expiresAt: null,
    });
  });

  it('produces what the published contract accepts', () => {
    expect(videoService.videoListItemSchema.safeParse(toVideoListItem(aVideo())).success).toBe(
      true,
    );
  });
});
