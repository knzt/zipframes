import { NotFoundError } from '@zipframes/core';

/**
 * Another owner's video and a missing video get this same answer, so nobody
 * learns which ids exist.
 */
export class VideoNotFoundError extends NotFoundError {
  constructor() {
    super('VIDEO_NOT_FOUND', 'video not found');
  }
}
