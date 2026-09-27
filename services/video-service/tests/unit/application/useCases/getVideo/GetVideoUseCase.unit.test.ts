import { describe, expect, it } from 'vitest';

import { GetVideoUseCase } from '../../../../../src/application/useCases/getVideo/GetVideoUseCase.js';
import { InMemoryVideoRepository } from '../../../../support/in-memory.js';
import { aVideo, OTHER_OWNER_ID, OWNER_ID, VIDEO_ID } from '../../../../support/videos.js';

const getVideo = new GetVideoUseCase(new InMemoryVideoRepository().seed(aVideo('DONE')));

describe('GetVideoUseCase', () => {
  it('returns the owned video', async () => {
    const result = await getVideo.execute({ ownerId: OWNER_ID, videoId: VIDEO_ID });

    expect(result.ok && result.value.toJSON()).toEqual(aVideo('DONE').toJSON());
  });

  it('answers 404 for another owner', async () => {
    const result = await getVideo.execute({ ownerId: OTHER_OWNER_ID, videoId: VIDEO_ID });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'VIDEO_NOT_FOUND', statusCode: 404 },
    });
  });
});
