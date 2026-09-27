import type { ConflictError, NotFoundError } from '@zipframes/core';

export interface DeleteVideoUseCaseInput {
  readonly ownerId: string;
  readonly videoId: string;
}

export type DeleteVideoUseCaseOutput = undefined;

export type DeleteVideoUseCaseError = NotFoundError | ConflictError;
