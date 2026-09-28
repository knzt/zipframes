import { err, ok, ValidationError } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { createFileName, type FileName } from './fileName.js';

/** What the owner said about the file: its name and its MIME type. */
export interface VideoFile {
  readonly name: FileName;
  readonly contentType: string;
}

const CONTENT_TYPE_MAX_LENGTH = 100;
const MIME_TYPE = /^[\w.+-]+\/[\w.+-]+$/u;

/** Validated before any byte is received, so a wrong file is refused up front. */
export const createVideoFile = (
  name: string,
  contentType: string,
): Result<VideoFile, ValidationError> => {
  const fileName = createFileName(name);
  if (!fileName.ok) {
    return fileName;
  }

  const type = contentType.trim();
  if (type.length > CONTENT_TYPE_MAX_LENGTH || !MIME_TYPE.test(type)) {
    return err(new ValidationError('INVALID_CONTENT_TYPE', 'content type must be a MIME type'));
  }

  return ok({ name: fileName.value, contentType: type });
};
