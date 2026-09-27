import type { ValidationError } from '@zipframes/core';

export interface RequestUploadUseCaseInput {
  readonly ownerId: string;
  readonly originalFileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface RequestUploadUseCaseOutput {
  readonly videoId: string;
  readonly uploadUrl: string;
  readonly sourceKey: string;
  readonly expiresInSeconds: number;
}

export type RequestUploadUseCaseError = ValidationError;
