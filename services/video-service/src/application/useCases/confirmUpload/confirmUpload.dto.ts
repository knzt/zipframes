import type { ConflictError, NotFoundError, ValidationError } from '@zipframes/core';

export interface ConfirmUploadUseCaseInput {
  readonly ownerId: string;
  readonly videoId: string;
  readonly correlationId: string;
}

export interface ConfirmUploadUseCaseOutput {
  readonly videoId: string;
  readonly status: 'QUEUED';
}

export type ConfirmUploadUseCaseError = NotFoundError | ConflictError | ValidationError;
