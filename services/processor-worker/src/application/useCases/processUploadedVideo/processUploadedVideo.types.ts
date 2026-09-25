import type { ProcessingError } from '../../../domain/errors/processingError.js';
import type { ProcessingResult } from '../../../domain/valueObjects/processingResult.js';

export interface ProcessUploadedVideoUseCaseInput {
  readonly videoId: string;
  readonly ownerId: string;
  readonly sourceKey: string;
  readonly originalFileName: string;
  readonly sizeBytes: number;
  readonly attempt: number;
  readonly correlationId: string;
}

export type ProcessUploadedVideoUseCaseOutput = ProcessingResult;

export type ProcessUploadedVideoUseCaseError = ProcessingError;
