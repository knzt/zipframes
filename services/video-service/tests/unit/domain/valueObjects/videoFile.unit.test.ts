import { describe, expect, it } from 'vitest';

import { createVideoFile } from '../../../../src/domain/valueObjects/videoFile.js';

describe('createVideoFile', () => {
  it('keeps the validated name and the trimmed MIME type', () => {
    expect(createVideoFile('aula.mp4', ' video/mp4 ')).toEqual({
      ok: true,
      value: { name: 'aula.mp4', contentType: 'video/mp4' },
    });
  });

  it('refuses a name the context does not accept before looking at the type', () => {
    expect(createVideoFile('foto.png', 'image/png')).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_EXTENSION' },
    });
  });

  it.each(['', 'video', 'video/mp4; codecs=avc1', `video/${'x'.repeat(100)}`])(
    'rejects the content type %j',
    (contentType) => {
      expect(createVideoFile('aula.mp4', contentType)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_CONTENT_TYPE' },
      });
    },
  );
});
