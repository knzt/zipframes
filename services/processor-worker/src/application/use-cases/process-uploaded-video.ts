import type { ArchiveBuilder } from '../gateways/archive-builder.js';
import type { EventPublisher } from '../gateways/event-publisher.js';
import type { FrameExtractor } from '../gateways/frame-extractor.js';
import type { ObjectStorage } from '../gateways/object-storage.js';
import type { WorkDirectory } from '../gateways/work-directory.js';
import { isProcessingError, ProcessingError } from '../../domain/errors.js';
import { framesPackageObjectKey } from '../../domain/frames-package.js';
import type { ProcessingJob } from '../../domain/processing-job.js';
import type { ProcessingResult } from '../../domain/processing-result.js';

export interface ProcessUploadedVideoDeps {
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
    throw new ProcessingError('transient', 'PROCESSING_TIMEOUT', 'processing was cancelled');
  }
};

const classifyFailure = (error: unknown, timedOut: boolean, timeoutMs: number): ProcessingError => {
  if (timedOut && !isProcessingError(error)) {
    return new ProcessingError(
      'transient',
      'PROCESSING_TIMEOUT',
      `processing exceeded ${String(timeoutMs)}ms`,
      error,
    );
  }
  if (isProcessingError(error)) {
    return error;
  }
  return new ProcessingError(
    'transient',
    'UNEXPECTED',
    error instanceof Error ? error.message : 'unexpected processing error',
    error,
  );
};

export const createProcessUploadedVideo = (
  deps: ProcessUploadedVideoDeps,
): ProcessUploadedVideo => {
  const publishProcessingStarted = async (job: ProcessingJob): Promise<void> => {
    await deps.events.publish({
      eventType: 'video.processing.started',
      correlationId: job.correlationId,
      payload: { videoId: job.videoId, attempt: job.attempt },
    });
  };

  const downloadOriginalVideo = async (
    job: ProcessingJob,
    workspace: JobWorkspace,
    signal: AbortSignal,
  ): Promise<void> => {
    await deps.storage.downloadToFile(job.sourceKey, workspace.originalVideoPath, signal);
  };

  const extractFrames = async (
    workspace: JobWorkspace,
    signal: AbortSignal,
  ): Promise<readonly string[]> => {
    const framePaths = await deps.extractor.extract(
      workspace.originalVideoPath,
      workspace.framesDirectory,
      signal,
    );
    if (framePaths.length === 0) {
      throw new ProcessingError('permanent', 'NO_FRAMES', 'ffmpeg produced no frames');
    }
    return framePaths;
  };

  const storeFramesPackage = async (
    job: ProcessingJob,
    workspace: JobWorkspace,
    framePaths: readonly string[],
    signal: AbortSignal,
  ): Promise<FramesPackageReady> => {
    await deps.archive.createZip(framePaths, workspace.framesPackagePath);
    ensureStillRunning(signal);
    const objectKey = framesPackageObjectKey(job.ownerId, job.videoId);
    await deps.storage.uploadFile(
      objectKey,
      workspace.framesPackagePath,
      'application/zip',
      signal,
    );
    return { objectKey, frameCount: framePaths.length };
  };

  const publishFramesPackaged = async (
    job: ProcessingJob,
    packaged: FramesPackageReady,
    startedAt: number,
  ): Promise<void> => {
    const durationMs = Math.max(0, deps.now().getTime() - startedAt);
    await deps.events.publish({
      eventType: 'video.processed',
      correlationId: job.correlationId,
      payload: {
        videoId: job.videoId,
        resultKey: packaged.objectKey,
        frameCount: packaged.frameCount,
        durationMs,
      },
    });
  };

  const publishMediaRejected = async (
    job: ProcessingJob,
    failure: ProcessingError,
  ): Promise<void> => {
    await deps.events.publish({
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
  };

  const discardOriginalVideo = async (job: ProcessingJob): Promise<void> => {
    try {
      await deps.storage.deleteObject(job.sourceKey);
    } catch (error) {
      deps.onDiscardOriginalFailed?.(job, error);
    }
  };

  const buildFramesPackage = async (
    job: ProcessingJob,
    workspace: JobWorkspace,
    signal: AbortSignal,
  ): Promise<FramesPackageReady> => {
    ensureStillRunning(signal);
    await downloadOriginalVideo(job, workspace, signal);
    ensureStillRunning(signal);
    const framePaths = await extractFrames(workspace, signal);
    ensureStillRunning(signal);
    const packaged = await storeFramesPackage(job, workspace, framePaths, signal);
    ensureStillRunning(signal);
    return packaged;
  };

  return async (job) => {
    const workspace = await openJobWorkspace(deps.workDirectory, job.videoId, job.originalFileName);
    const startedAt = deps.now().getTime();
    const deadline = startDeadline(deps.processingTimeoutMs);

    try {
      await publishProcessingStarted(job);
      const packaged = await buildFramesPackage(job, workspace, deadline.signal);
      await publishFramesPackaged(job, packaged, startedAt);
      await discardOriginalVideo(job);
      return 'frames_packaged';
    } catch (error) {
      const failure = classifyFailure(error, deadline.timedOut(), deps.processingTimeoutMs);
      if (failure.kind === 'permanent') {
        await publishMediaRejected(job, failure);
        await discardOriginalVideo(job);
        return 'media_rejected';
      }
      throw failure;
    } finally {
      deadline.cancel();
      await deps.workDirectory.removeDir(workspace.rootDir);
    }
  };
};
