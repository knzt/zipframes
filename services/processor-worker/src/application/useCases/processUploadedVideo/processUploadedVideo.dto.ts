import type { ArchiveBuilder } from '../../ports/services/archiveBuilder.service.js';
import type { EventPublisher } from '../../ports/gateways/eventPublisher.gateway.js';
import type { FrameExtractor } from '../../ports/gateways/frameExtractor.gateway.js';
import type { ObjectStorage } from '../../ports/gateways/objectStorage.gateway.js';
import type { WorkDirectory } from '../../ports/services/workDirectory.service.js';
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
