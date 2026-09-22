import type { ArchiveBuilder } from '../gateways/archive-builder.js';
import type { EventPublisher } from '../gateways/event-publisher.js';
import type { FrameExtractor } from '../gateways/frame-extractor.js';
import type { ObjectStorage } from '../gateways/object-storage.js';
import type { WorkDirectory } from '../gateways/work-directory.js';
import { isProcessingError, ProcessingError } from '../../domain/errors.js';
import { resultObjectKey } from '../../domain/frames-package.js';
import type { ProcessingJob } from '../../domain/processing-job.js';

export interface ProcessUploadedVideoDeps {
  readonly storage: ObjectStorage;
  readonly extractor: FrameExtractor;
  readonly archive: ArchiveBuilder;
  readonly workDirectory: WorkDirectory;
  readonly events: EventPublisher;
  readonly now: () => Date;
  readonly processingTimeoutMs: number;
  readonly onDeleteOriginalFailed?: (job: ProcessingJob, error: unknown) => void;
}

export type ProcessOutcome = 'success' | 'permanent_failure';

export type ProcessUploadedVideo = (job: ProcessingJob) => Promise<ProcessOutcome>;

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new ProcessingError('transient', 'PROCESSING_TIMEOUT', 'processing was cancelled');
  }
};

export const createProcessUploadedVideo = (
  deps: ProcessUploadedVideoDeps,
): ProcessUploadedVideo => {
  return async (job) => {
    const workDir = await deps.workDirectory.createTempDir(job.videoId);
    const startedAt = deps.now().getTime();
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, deps.processingTimeoutMs);

    try {
      await deps.events.publish({
        eventType: 'video.processing.started',
        correlationId: job.correlationId,
        payload: { videoId: job.videoId, attempt: job.attempt },
      });

      throwIfAborted(controller.signal);

      const sourcePath = `${workDir}/source`;
      const framesDir = `${workDir}/frames`;
      const zipPath = `${workDir}/result.zip`;

      await deps.storage.downloadToFile(job.sourceKey, sourcePath, controller.signal);
      throwIfAborted(controller.signal);

      const frames = await deps.extractor.extract(sourcePath, framesDir, controller.signal);
      throwIfAborted(controller.signal);

      if (frames.length === 0) {
        throw new ProcessingError('permanent', 'NO_FRAMES', 'ffmpeg produced no frames');
      }

      await deps.archive.createZip(frames, zipPath);
      throwIfAborted(controller.signal);

      const resultKey = resultObjectKey(job.ownerId, job.videoId);
      await deps.storage.uploadFile(resultKey, zipPath, 'application/zip', controller.signal);

      const durationMs = Math.max(0, deps.now().getTime() - startedAt);
      await deps.events.publish({
        eventType: 'video.processed',
        correlationId: job.correlationId,
        payload: {
          videoId: job.videoId,
          resultKey,
          frameCount: frames.length,
          durationMs,
        },
      });

      try {
        await deps.storage.deleteObject(job.sourceKey);
      } catch (error) {
        deps.onDeleteOriginalFailed?.(job, error);
      }

      return 'success';
    } catch (error) {
      const processingError =
        controller.signal.aborted && !isProcessingError(error)
          ? new ProcessingError(
              'transient',
              'PROCESSING_TIMEOUT',
              `processing exceeded ${String(deps.processingTimeoutMs)}ms`,
              error,
            )
          : isProcessingError(error)
            ? error
            : new ProcessingError(
                'transient',
                'UNEXPECTED',
                error instanceof Error ? error.message : 'unexpected processing error',
                error,
              );

      if (processingError.kind === 'permanent') {
        await deps.events.publish({
          eventType: 'video.failed',
          correlationId: job.correlationId,
          payload: {
            videoId: job.videoId,
            ownerId: job.ownerId,
            errorCode: processingError.code,
            reason: processingError.message,
            attempts: job.attempt,
          },
        });

        try {
          await deps.storage.deleteObject(job.sourceKey);
        } catch (deleteError) {
          deps.onDeleteOriginalFailed?.(job, deleteError);
        }
        return 'permanent_failure';
      }

      throw processingError;
    } finally {
      clearTimeout(timeout);
      await deps.workDirectory.removeDir(workDir);
    }
  };
};
