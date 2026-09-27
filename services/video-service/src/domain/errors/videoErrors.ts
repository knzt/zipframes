import { DomainError } from '@zipframes/core';

import type { VideoStatus } from '../valueObjects/videoStatus.js';

export type VideoAction = 'confirm the upload of' | 'delete' | 'expire';

/**
 * The state machine refused the move. The use case decides what that means
 * to the caller (a 409 over HTTP, an ignored message on the broker).
 */
export class InvalidVideoTransitionError extends DomainError {
  constructor(
    readonly from: VideoStatus,
    readonly action: VideoAction,
  ) {
    super('INVALID_VIDEO_TRANSITION', `cannot ${action} a video in ${from}`, {
      details: { from, action },
    });
  }
}

/** The owner asked to confirm an upload that never reached the storage. */
export class UploadNotFoundError extends DomainError {
  constructor() {
    super('UPLOAD_NOT_FOUND', 'the file was not uploaded yet');
  }
}
