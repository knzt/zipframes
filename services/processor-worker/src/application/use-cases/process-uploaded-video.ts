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
}

export type ProcessUploadedVideo = (job: ProcessingJob) => Promise<void>;

const publish = async (
  events: EventPublisher,
  eventType: string,
  correlationId: string,
  payload: Record<string, unknown>,
): Promise<void> => {
  await events.publish({ eventType, correlationId, payload });
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ProcessingError(
              'transient',
              'PROCESSING_TIMEOUT',
              `processing exceeded ${String(timeoutMs)}ms`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};

export const createProcessUploadedVideo = (
  deps: ProcessUploadedVideoDeps,
): ProcessUploadedVideo => {
  return async (job) => {
    const workDir = await deps.workDirectory.createTempDir(job.videoId);
    const startedAt = deps.now().getTime();

    try {
      await publish(deps.events, 'video.processing.started', job.correlationId, {
        videoId: job.videoId,
        attempt: job.attempt,
      });

      await withTimeout(
        (async () => {
          const sourcePath = `${workDir}/source`;
          const framesDir = `${workDir}/frames`;
          const zipPath = `${workDir}/result.zip`;

          await deps.storage.downloadToFile(job.sourceKey, sourcePath);
          const frames = await deps.extractor.extract(sourcePath, framesDir);

          if (frames.length === 0) {
            throw new ProcessingError('permanent', 'NO_FRAMES', 'ffmpeg produced no frames');
          }

          await deps.archive.createZip(frames, zipPath);

          const resultKey = resultObjectKey(job.ownerId, job.videoId);
          await deps.storage.uploadFile(resultKey, zipPath, 'application/zip');

          const durationMs = Math.max(0, deps.now().getTime() - startedAt);
          await publish(deps.events, 'video.processed', job.correlationId, {
            videoId: job.videoId,
            resultKey,
            frameCount: frames.length,
            durationMs,
          });

          try {
            await deps.storage.deleteObject(job.sourceKey);
          } catch {
            // Deletion must not undo a successful result; cleanup routine removes leftovers.
          }
        })(),
        deps.processingTimeoutMs,
      );
    } catch (error) {
      const processingError = isProcessingError(error)
        ? error
        : new ProcessingError(
            'transient',
            'UNEXPECTED',
            error instanceof Error ? error.message : 'unexpected processing error',
            error,
          );

      if (processingError.kind === 'permanent') {
        await publish(deps.events, 'video.failed', job.correlationId, {
          videoId: job.videoId,
          ownerId: job.ownerId,
          errorCode: processingError.code,
          reason: processingError.message,
          attempts: job.attempt,
        });

        try {
          await deps.storage.deleteObject(job.sourceKey);
        } catch {
          // same as success path
        }
        return;
      }

      throw processingError;
    } finally {
      await deps.workDirectory.removeDir(workDir);
    }
  };
};
