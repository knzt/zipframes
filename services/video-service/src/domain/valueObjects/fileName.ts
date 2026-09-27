import { err, ok, ValidationError } from '@zipframes/core';
import type { Brand, Result } from '@zipframes/core';

/** The name the owner gave the file, with an extension this context accepts. */
export type FileName = Brand<string, 'FileName'>;

/** Same list as the base project the investors saw. */
export const ACCEPTED_VIDEO_EXTENSIONS = [
  'mp4',
  'avi',
  'mov',
  'mkv',
  'wmv',
  'flv',
  'webm',
] as const;

const MAX_LENGTH = 255;
// A name, not a path: separators and control characters would end up in
// object metadata and in the Content-Disposition of the download.
const FORBIDDEN = /[/\\\u0000-\u001f\u007f]/u;

const extensionOf = (name: string): string | undefined =>
  /\.([^.]+)$/u.exec(name)?.[1]?.toLowerCase();

export const createFileName = (raw: string): Result<FileName, ValidationError> => {
  const name = raw.trim();
  if (name.length === 0 || name.length > MAX_LENGTH || FORBIDDEN.test(name)) {
    return err(
      new ValidationError(
        'INVALID_FILE_NAME',
        `file name must have 1 to ${String(MAX_LENGTH)} characters and no path separators`,
      ),
    );
  }

  const extension = extensionOf(name);
  if (
    extension === undefined ||
    !(ACCEPTED_VIDEO_EXTENSIONS as readonly string[]).includes(extension)
  ) {
    return err(
      new ValidationError(
        'UNSUPPORTED_EXTENSION',
        `file extension must be one of: ${ACCEPTED_VIDEO_EXTENSIONS.join(', ')}`,
      ),
    );
  }

  return ok(name as FileName);
};

/** Rehydrates a name that was validated before it was stored. */
export const asFileName = (name: string): FileName => name as FileName;
