import { beforeEach, describe, expect, it } from 'vitest';

import { ApplyProcessingEventUseCase } from '../../../../../src/application/useCases/applyProcessingEvent/ApplyProcessingEventUseCase.js';
import { InMemoryVideoListCache, InMemoryVideoRepository } from '../../../../support/in-memory.js';
import { aVideo, OWNER_ID, RETENTION_MS, VIDEO_ID } from '../../../../support/videos.js';

const completed = {
  videoId: VIDEO_ID,
  event: {
    kind: 'completed' as const,
    resultKey: `outputs/${OWNER_ID}/${VIDEO_ID}.zip`,
    frameCount: 9,
  },
};

let videos: InMemoryVideoRepository;
let cache: InMemoryVideoListCache;
let applyProcessingEvent: ApplyProcessingEventUseCase;

beforeEach(() => {
  videos = new InMemoryVideoRepository();
  cache = new InMemoryVideoListCache();
  applyProcessingEvent = new ApplyProcessingEventUseCase(videos, cache, RETENTION_MS);
});

describe('ApplyProcessingEventUseCase', () => {
  it('stores the transition and invalidates the owner list', async () => {
    videos.seed(aVideo('PROCESSING'));

    const result = await applyProcessingEvent.execute(completed);

    expect(result).toEqual({ outcome: 'applied', status: 'DONE' });
    expect(videos.rows.get(VIDEO_ID)?.toJSON()).toMatchObject({ status: 'DONE', frameCount: 9 });
    expect(cache.invalidated).toEqual([OWNER_ID]);
  });

  it('is idempotent: a redelivered event changes nothing', async () => {
    videos.seed(aVideo('PROCESSING'));
    await applyProcessingEvent.execute(completed);

    const again = await applyProcessingEvent.execute(completed);

    expect(again).toEqual({ outcome: 'ignored', reason: 'processing_finished' });
    expect(videos.saves).toBe(1);
  });

  it('ignores a late start after the result', async () => {
    videos.seed(aVideo('FAILED'));

    expect(
      await applyProcessingEvent.execute({ videoId: VIDEO_ID, event: { kind: 'started' } }),
    ).toEqual({
      outcome: 'ignored',
      reason: 'processing_finished',
    });
    expect(videos.saves).toBe(0);
  });

  it('acknowledges an event for an id it never had', async () => {
    expect(await applyProcessingEvent.execute(completed)).toEqual({ outcome: 'unknown_video' });
  });

  it('throws a retryable error when the video is not queued yet, so the message comes back', async () => {
    videos.seed(aVideo('AWAITING_UPLOAD'));

    await expect(applyProcessingEvent.execute(completed)).rejects.toMatchObject({
      code: 'VIDEO_NOT_QUEUED_YET',
      retryable: true,
    });
  });
});
