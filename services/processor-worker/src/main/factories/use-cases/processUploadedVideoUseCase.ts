import type { EventPublisher } from '../../../application/interfaces/gateways/EventPublisher.js';
import {
  ProcessUploadedVideoUseCase,
  type ProcessUploadedVideoUseCaseInput,
} from '../../../application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';
import type { S3 } from '../externals/s3.js';
import { createFrameExtractorGateway } from '../gateways/frameExtractorGateway.js';
import { createObjectStorageGateway } from '../gateways/objectStorageGateway.js';
import { createArchiveBuilder } from '../services/archiveBuilder.js';
import { createWorkDirectory } from '../services/workDirectory.js';

/** Clients and config opened once in `start.ts` and reused for this use case. */
export interface ProcessUploadedVideoExternalDeps {
  readonly s3: S3;
  readonly eventPublisher: EventPublisher;
  readonly bucket: string;
  readonly workDir: string;
  readonly processingTimeoutMs: number;
  readonly onDiscardOriginalFailed?: (
    job: ProcessUploadedVideoUseCaseInput,
    error: unknown,
  ) => void;
}

export const createProcessUploadedVideoUseCase = (
  externalDeps: ProcessUploadedVideoExternalDeps,
): ProcessUploadedVideoUseCase =>
  new ProcessUploadedVideoUseCase(
    createObjectStorageGateway({
      s3: externalDeps.s3,
      bucket: externalDeps.bucket,
    }),
    createFrameExtractorGateway(),
    createArchiveBuilder(),
    createWorkDirectory(externalDeps.workDir),
    externalDeps.eventPublisher,
    externalDeps.processingTimeoutMs,
    externalDeps.onDiscardOriginalFailed,
  );
