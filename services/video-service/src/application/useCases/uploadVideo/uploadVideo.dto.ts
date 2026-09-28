import type { Readable } from 'node:stream';

import type { ApplicationError, ValidationError } from '@zipframes/core';

export interface UploadVideoUseCaseInput {
  readonly ownerId: string;
  readonly originalFileName: string;
  readonly contentType: string;
  readonly content: Readable;
  readonly correlationId: string;
}

export interface UploadVideoUseCaseOutput {
  readonly videoId: string;
  readonly status: 'QUEUED';
}

/** `ApplicationError` with status 413 when the file is above the limit. */
export type UploadVideoUseCaseError = ValidationError | ApplicationError;
