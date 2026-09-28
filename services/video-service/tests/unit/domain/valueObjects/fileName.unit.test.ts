import { describe, expect, it } from 'vitest';

import {
  ACCEPTED_VIDEO_EXTENSIONS,
  createFileName,
} from '../../../../src/domain/valueObjects/fileName.js';

describe('createFileName', () => {
  it.each(ACCEPTED_VIDEO_EXTENSIONS)('accepts the .%s extension', (extension) => {
    expect(createFileName(`aula.${extension}`)).toEqual({ ok: true, value: `aula.${extension}` });
  });

  it('matches the extension without regard to case and keeps the name as given', () => {
    expect(createFileName('Aula Final.MP4')).toEqual({ ok: true, value: 'Aula Final.MP4' });
  });

  it('trims surrounding whitespace', () => {
    expect(createFileName('  aula.mov ')).toEqual({ ok: true, value: 'aula.mov' });
  });

  it.each(['aula.gif', 'aula', 'aula.', 'mp4'])('rejects %j as UNSUPPORTED_EXTENSION', (name) => {
    expect(createFileName(name)).toMatchObject({
      ok: false,
      error: { code: 'UNSUPPORTED_EXTENSION' },
    });
  });

  it.each([
    ['empty', '   '],
    ['a path', '../etc/aula.mp4'],
    ['a windows path', 'C:\\videos\\aula.mp4'],
    ['a control character', 'aula\n.mp4'],
    ['too long', `${'a'.repeat(252)}.mp4`],
  ])('rejects a name that is %s as INVALID_FILE_NAME', (_label, name) => {
    expect(createFileName(name)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_FILE_NAME', statusCode: 400 },
    });
  });

  it('accepts a name of exactly 255 characters', () => {
    expect(createFileName(`${'a'.repeat(251)}.mp4`).ok).toBe(true);
  });
});
