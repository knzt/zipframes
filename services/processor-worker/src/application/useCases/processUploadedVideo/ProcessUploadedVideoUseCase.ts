import { InfrastructureError, InternalServerError, TimeoutError } from '@zipframes/core';

import { framesPackageObjectKey } from '../../../domain/policies/framesPackage.js';
import type { ProcessingJob } from '../../../domain/valueObjects/processingJob.js';
import type { ProcessingResult } from '../../../domain/valueObjects/processingResult.js';
import type { EventPublisher } from '../../interfaces/gateways/EventPublisher.js';
import type { FrameExtractor } from '../../interfaces/gateways/FrameExtractor.js';
import type { ObjectStorage } from '../../interfaces/gateways/ObjectStorage.js';
import type { ArchiveBuilder } from '../../interfaces/services/ArchiveBuilder.js';
import type { WorkDirectory } from '../../interfaces/services/WorkDirectory.js';

export type ProcessUploadedVideoUseCaseInput = ProcessingJob;
export type ProcessUploadedVideoUseCaseOutput = ProcessingResult;
export type ProcessUploadedVideoUseCaseError = InfrastructureError;

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
    throw new TimeoutError('PROCESSING_TIMEOUT', 'processing was cancelled');
  }
};

const classifyFailure = (
  error: unknown,
  timedOut: boolean,
  timeoutMs: number,
): InfrastructureError => {
  if (timedOut && !(error instanceof InfrastructureError)) {
    return new TimeoutError('PROCESSING_TIMEOUT', `processing exceeded ${String(timeoutMs)}ms`, {
      cause: error,
    });
  }
  if (error instanceof InfrastructureError) {
    return error;
  }
  return new InfrastructureError(
    'UNEXPECTED',
    error instanceof Error ? error.message : 'unexpected processing error',
    { cause: error },
  );
};

export interface ProcessUploadedVideoUseCaseDeps {
  readonly objectStorage: ObjectStorage;
  readonly frameExtractor: FrameExtractor;
  readonly archiveBuilder: ArchiveBuilder;
  readonly workDirectory: WorkDirectory;
  readonly eventPublisher: EventPublisher;
  readonly processingTimeoutMs: number;
  readonly onDiscardOriginalFailed?: (
    job: ProcessUploadedVideoUseCaseInput,
    error: unknown,
  ) => void;
}

export class ProcessUploadedVideoUseCase {
  constructor(private readonly deps: ProcessUploadedVideoUseCaseDeps) {}

  async execute(job: ProcessUploadedVideoUseCaseInput): Promise<ProcessUploadedVideoUseCaseOutput> {
    const workspace = await openJobWorkspace(
      this.deps.workDirectory,
      job.videoId,
      job.originalFileName,
    );
    const startedAt = new Date().getTime();
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

  private async publishProcessingStarted(job: ProcessUploadedVideoUseCaseInput): Promise<void> {
    await this.deps.eventPublisher.publish({
      eventType: 'video.processing.started',
      correlationId: job.correlationId,
      payload: { videoId: job.videoId, attempt: job.attempt },
    });
  }

  private async downloadOriginalVideo(
    job: ProcessUploadedVideoUseCaseInput,
    workspace: JobWorkspace,
    signal: AbortSignal,
  ): Promise<void> {
    await this.deps.objectStorage.downloadToFile(
      job.sourceKey,
      workspace.originalVideoPath,
      signal,
    );
  }

  private async extractFrames(
    workspace: JobWorkspace,
    signal: AbortSignal,
  ): Promise<readonly string[]> {
    const framePaths = await this.deps.frameExtractor.extract(
      workspace.originalVideoPath,
      workspace.framesDirectory,
      signal,
    );
    if (framePaths.length === 0) {
      throw new InternalServerError('NO_FRAMES', 'ffmpeg produced no frames');
    }
    return framePaths;
  }

  private async storeFramesPackage(
    job: ProcessUploadedVideoUseCaseInput,
    workspace: JobWorkspace,
    framePaths: readonly string[],
    signal: AbortSignal,
  ): Promise<FramesPackageReady> {
    await this.deps.archiveBuilder.createZip(framePaths, workspace.framesPackagePath);
    ensureStillRunning(signal);
    const objectKey = framesPackageObjectKey(job.ownerId, job.videoId);
    await this.deps.objectStorage.uploadFile(
      objectKey,
      workspace.framesPackagePath,
      'application/zip',
      signal,
    );
    return { objectKey, frameCount: framePaths.length };
  }

  private async publishFramesPackaged(
    job: ProcessUploadedVideoUseCaseInput,
    packaged: FramesPackageReady,
    startedAt: number,
  ): Promise<void> {
    const durationMs = Math.max(0, new Date().getTime() - startedAt);
    await this.deps.eventPublisher.publish({
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

  private async publishMediaRejected(
    job: ProcessUploadedVideoUseCaseInput,
    failure: InfrastructureError,
  ): Promise<void> {
    await this.deps.eventPublisher.publish({
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

  private async discardOriginalVideo(job: ProcessUploadedVideoUseCaseInput): Promise<void> {
    try {
      await this.deps.objectStorage.deleteObject(job.sourceKey);
    } catch (error) {
      this.deps.onDiscardOriginalFailed?.(job, error);
    }
  }

  private async buildFramesPackage(
    job: ProcessUploadedVideoUseCaseInput,
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
