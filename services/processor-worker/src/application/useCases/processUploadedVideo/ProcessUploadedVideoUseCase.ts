import { isProcessingError, ProcessingError } from '../../../domain/errors/processingError.js';
import { framesPackageObjectKey } from '../../../domain/policies/framesPackage.js';
import type { ProcessingJob } from '../../../domain/valueObjects/processingJob.js';
import type { ProcessingResult } from '../../../domain/valueObjects/processingResult.js';
import type { EventPublisher } from '../../interfaces/gateways/eventPublisher.gateway.js';
import type { FrameExtractor } from '../../interfaces/gateways/frameExtractor.gateway.js';
import type { ObjectStorage } from '../../interfaces/gateways/objectStorage.gateway.js';
import type { ArchiveBuilder } from '../../interfaces/services/archiveBuilder.service.js';
import type { WorkDirectory } from '../../interfaces/services/workDirectory.service.js';

interface JobWorkspace {
  readonly rootDir: string;
  readonly originalVideoPath: string;
  readonly framesDirectory: string;
  readonly framesPackagePath: string;
}

interface FramesPackageReady {
  readonly objectKey: string;
  readonly frameCount: number;
}

interface ProcessingDeadline {
  readonly signal: AbortSignal;
  readonly cancel: () => void;
  readonly timedOut: () => boolean;
}

const originalVideoName = (originalFileName: string): string => {
  const extension = /\.([a-z0-9]{1,8})$/i.exec(originalFileName)?.[1];
  if (extension === undefined) {
    return 'original.bin';
  }
  return `original.${extension.toLowerCase()}`;
};

const openJobWorkspace = async (
  workDirectory: WorkDirectory,
  videoId: string,
  originalFileName: string,
): Promise<JobWorkspace> => {
  const rootDir = await workDirectory.createTempDir(videoId);
  return {
    rootDir,
    originalVideoPath: `${rootDir}/${originalVideoName(originalFileName)}`,
    framesDirectory: `${rootDir}/frames`,
    framesPackagePath: `${rootDir}/frames.zip`,
  };
};

const startDeadline = (timeoutMs: number): ProcessingDeadline => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timer);
    },
    timedOut: () => controller.signal.aborted,
  };
};

const ensureStillRunning = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new ProcessingError(true, 'PROCESSING_TIMEOUT', 'processing was cancelled');
  }
};

const classifyFailure = (error: unknown, timedOut: boolean, timeoutMs: number): ProcessingError => {
  if (timedOut && !isProcessingError(error)) {
    return new ProcessingError(
      true,
      'PROCESSING_TIMEOUT',
      `processing exceeded ${String(timeoutMs)}ms`,
      error,
    );
  }
  if (isProcessingError(error)) {
    return error;
  }
  return new ProcessingError(
    true,
    'UNEXPECTED',
    error instanceof Error ? error.message : 'unexpected processing error',
    error,
  );
};

export class ProcessUploadedVideoUseCase {
  constructor(
    private readonly deps: {
      readonly storage: ObjectStorage;
      readonly extractor: FrameExtractor;
      readonly archive: ArchiveBuilder;
      readonly workDirectory: WorkDirectory;
      readonly events: EventPublisher;
      readonly now: () => Date;
      readonly processingTimeoutMs: number;
      readonly onDiscardOriginalFailed?: (job: ProcessingJob, error: unknown) => void;
    },
  ) {}

  async execute(job: ProcessingJob): Promise<ProcessingResult> {
    const workspace = await openJobWorkspace(
      this.deps.workDirectory,
      job.videoId,
      job.originalFileName,
    );
    const startedAt = this.deps.now().getTime();
    const deadline = startDeadline(this.deps.processingTimeoutMs);

    try {
      await this.publishProcessingStarted(job);
      const packaged = await this.buildFramesPackage(job, workspace, deadline.signal);
      await this.publishFramesPackaged(job, packaged, startedAt);
      await this.discardOriginalVideo(job);
      return 'frames_packaged';
    } catch (error) {
      const failure = classifyFailure(error, deadline.timedOut(), this.deps.processingTimeoutMs);
      if (!failure.retryable) {
        await this.publishMediaRejected(job, failure);
        await this.discardOriginalVideo(job);
        return 'media_rejected';
      }
      throw failure;
    } finally {
      deadline.cancel();
      await this.deps.workDirectory.removeDir(workspace.rootDir);
    }
  }

  private async publishProcessingStarted(job: ProcessingJob): Promise<void> {
    await this.deps.events.publish({
      eventType: 'video.processing.started',
      correlationId: job.correlationId,
      payload: { videoId: job.videoId, attempt: job.attempt },
    });
  }

  private async downloadOriginalVideo(
    job: ProcessingJob,
    workspace: JobWorkspace,
    signal: AbortSignal,
  ): Promise<void> {
    await this.deps.storage.downloadToFile(job.sourceKey, workspace.originalVideoPath, signal);
  }

  private async extractFrames(
    workspace: JobWorkspace,
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    const framePaths = await this.deps.extractor.extract(
      workspace.originalVideoPath,
      workspace.framesDirectory,
      signal,
    );
    if (framePaths.length === 0) {
      throw new ProcessingError(false, 'NO_FRAMES', 'ffmpeg produced no frames');
    }
    return framePaths;
  }

  private async storeFramesPackage(
    job: ProcessingJob,
    workspace: JobWorkspace,
    framePaths: readonly string[],
    signal: AbortSignal,
  ): Promise<FramesPackageReady> {
    await this.deps.archive.createZip(framePaths, workspace.framesPackagePath);
    ensureStillRunning(signal);
    const objectKey = framesPackageObjectKey(job.ownerId, job.videoId);
    await this.deps.storage.uploadFile(
      objectKey,
      workspace.framesPackagePath,
      'application/zip',
      signal,
    );
    return { objectKey, frameCount: framePaths.length };
  }

  private async publishFramesPackaged(
    job: ProcessingJob,
    packaged: FramesPackageReady,
    startedAt: number,
  ): Promise<void> {
    const durationMs = Math.max(0, this.deps.now().getTime() - startedAt);
    await this.deps.events.publish({
      eventType: 'video.processed',
      correlationId: job.correlationId,
      payload: {
        videoId: job.videoId,
        resultKey: packaged.objectKey,
        frameCount: packaged.frameCount,
        durationMs,
      },
    });
  }

  private async publishMediaRejected(job: ProcessingJob, failure: ProcessingError): Promise<void> {
    await this.deps.events.publish({
      eventType: 'video.failed',
      correlationId: job.correlationId,
      payload: {
        videoId: job.videoId,
        ownerId: job.ownerId,
        errorCode: failure.code,
        reason: failure.message,
        attempts: job.attempt,
      },
    });
  }

  private async discardOriginalVideo(job: ProcessingJob): Promise<void> {
    try {
      await this.deps.storage.deleteObject(job.sourceKey);
    } catch (error) {
      this.deps.onDiscardOriginalFailed?.(job, error);
    }
  }

  private async buildFramesPackage(
    job: ProcessingJob,
    workspace: JobWorkspace,
    signal: AbortSignal,
  ): Promise<FramesPackageReady> {
    ensureStillRunning(signal);
    await this.downloadOriginalVideo(job, workspace, signal);
    ensureStillRunning(signal);
    const framePaths = await this.extractFrames(workspace, signal);
    ensureStillRunning(signal);
    const packaged = await this.storeFramesPackage(job, workspace, framePaths, signal);
    ensureStillRunning(signal);
    return packaged;
  }
}
