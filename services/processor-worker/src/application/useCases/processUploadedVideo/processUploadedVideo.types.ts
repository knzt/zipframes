import type { InfrastructureError } from '@zipframes/core';

export interface ProcessUploadedVideoUseCaseInput {
  readonly videoId: string;
  readonly ownerId: string;
  readonly sourceKey: string;
  readonly originalFileName: string;
  readonly correlationId: string;
  readonly attempt: number;
}

export type ProcessUploadedVideoUseCaseOutput = 'frames_packaged' | 'media_rejected';

export type ProcessUploadedVideoUseCaseError = InfrastructureError;
