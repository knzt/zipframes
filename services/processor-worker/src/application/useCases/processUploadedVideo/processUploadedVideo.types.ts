import type { InfrastructureError } from '@zipframes/core';

import type { ProcessingJob } from '../../../domain/valueObjects/processingJob.js';
import type { ProcessingResult } from '../../../domain/valueObjects/processingResult.js';

export type ProcessUploadedVideoUseCaseInput = ProcessingJob;
export type ProcessUploadedVideoUseCaseOutput = ProcessingResult;
export type ProcessUploadedVideoUseCaseError = InfrastructureError;
