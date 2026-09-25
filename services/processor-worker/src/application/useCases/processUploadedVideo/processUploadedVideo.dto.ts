import type { ArchiveBuilder } from '../../interfaces/services/archiveBuilder.service.js';
import type { EventPublisher } from '../../interfaces/gateways/eventPublisher.gateway.js';
import type { FrameExtractor } from '../../interfaces/gateways/frameExtractor.gateway.js';
import type { ObjectStorage } from '../../interfaces/gateways/objectStorage.gateway.js';
import type { WorkDirectory } from '../../interfaces/services/workDirectory.service.js';
import type { ProcessingJob } from '../../../domain/valueObjects/processingJob.js';
import type { ProcessingResult } from '../../../domain/valueObjects/processingResult.js';

export interface ProcessUploadedVideoDependencies {
  readonly storage: ObjectStorage;
  readonly extractor: FrameExtractor;
  readonly archive: ArchiveBuilder;
  readonly workDirectory: WorkDirectory;
  readonly events: EventPublisher;
  readonly now: () => Date;
  readonly processingTimeoutMs: number;
  readonly onDiscardOriginalFailed?: (job: ProcessingJob, error: unknown) => void;
}

export type ProcessUploadedVideo = (job: ProcessingJob) => Promise<ProcessingResult>;
