import type { EventPublisher } from '../../../application/interfaces/gateways/EventPublisher.js';
import {
  ProcessUploadedVideoUseCase,
  type ProcessUploadedVideoUseCaseDeps,
} from '../../../application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';
import type { S3 } from '../externals/s3.js';
import { createFrameExtractor } from '../gateways/frameExtractor.js';
import { createObjectStorage } from '../gateways/objectStorage.js';
import { createArchiveBuilder } from '../services/archiveBuilder.js';
import { createWorkDirectory } from '../services/workDirectory.js';

export interface ProcessUploadedVideoExternals {
  readonly s3: S3;
  readonly events: EventPublisher;
  readonly bucket: string;
  readonly workDir: string;
  readonly processingTimeoutMs: number;
  readonly onDiscardOriginalFailed?: ProcessUploadedVideoUseCaseDeps['onDiscardOriginalFailed'];
}

export const createProcessUploadedVideo = (
  externals: ProcessUploadedVideoExternals,
): ProcessUploadedVideoUseCase =>
  new ProcessUploadedVideoUseCase({
    storage: createObjectStorage(externals.s3, externals.bucket),
    extractor: createFrameExtractor(),
    archive: createArchiveBuilder(),
    workDirectory: createWorkDirectory(externals.workDir),
    events: externals.events,
    processingTimeoutMs: externals.processingTimeoutMs,
    onDiscardOriginalFailed: externals.onDiscardOriginalFailed,
  });
