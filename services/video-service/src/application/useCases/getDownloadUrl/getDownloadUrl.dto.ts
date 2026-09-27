import type { ApplicationError, ConflictError, NotFoundError } from '@zipframes/core';

export interface GetDownloadUrlUseCaseInput {
  readonly ownerId: string;
  readonly videoId: string;
}

export interface GetDownloadUrlUseCaseOutput {
  readonly videoId: string;
  readonly downloadUrl: string;
  readonly expiresInSeconds: number;
}

/** `ApplicationError` with status 410 when the package no longer exists. */
export type GetDownloadUrlUseCaseError = NotFoundError | ConflictError | ApplicationError;
