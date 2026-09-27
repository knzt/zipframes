import type { MessageOutcome, MessageOutcomeContext } from '@zipframes/communication';
import { isBaseError, isRetryableError } from '@zipframes/core';
import type { Logger } from '@zipframes/logger';
import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';

import type { ProcessUploadedVideoUseCaseOutput } from '../../application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';

export interface JobMetrics {
  readonly recordFramesPackaged: (durationSeconds: number) => void;
  readonly recordMediaRejected: (durationSeconds: number) => void;
  readonly recordRetryScheduled: (durationSeconds: number) => void;
  readonly recordRetriesExhausted: (durationSeconds: number) => void;
}

export type VideoProcessingOutcome = MessageOutcome<
  VideoUploadedEvent,
  ProcessUploadedVideoUseCaseOutput
>;

const failureOf = (
  error: unknown,
): { readonly errorCode: string; readonly retryable: boolean } => ({
  errorCode: isBaseError(error) ? error.code : 'UNEXPECTED',
  retryable: isRetryableError(error),
});

/** Logs and records metrics for each settled `video.uploaded` message. */
export const createVideoProcessingObserver =
  (deps: { readonly logger: Logger; readonly metrics?: JobMetrics }) =>
  (outcome: VideoProcessingOutcome, { attempt, durationMs }: MessageOutcomeContext): void => {
    const durationSeconds = durationMs / 1000;

    if (outcome.kind === 'poison') {
      deps.logger.warn('poison video.uploaded message', { attempt, issues: outcome.error });
      return;
    }

    const { videoId, ownerId, originalFileName, sizeBytes } = outcome.event.payload;
    const video = { videoId, ownerId, attempt };

    switch (outcome.kind) {
      case 'handled':
        if (outcome.result === 'frames_packaged') {
          deps.metrics?.recordFramesPackaged(durationSeconds);
          deps.logger.info('video processed', {
            ...video,
            originalFileName,
            sizeBytes,
            processingResult: outcome.result,
            durationMs,
          });
          return;
        }
        deps.metrics?.recordMediaRejected(durationSeconds);
        deps.logger.warn('video processing rejected the media', {
          ...video,
          originalFileName,
          processingResult: outcome.result,
          durationMs,
        });
        return;
      case 'retry':
        deps.metrics?.recordRetryScheduled(durationSeconds);
        deps.logger.warn('video processing failed transiently; scheduling retry', {
          ...video,
          ...failureOf(outcome.error),
          processingResult: 'retry_scheduled',
          durationMs,
        });
        return;
      case 'exhausted':
        deps.metrics?.recordRetriesExhausted(durationSeconds);
        deps.logger.error('video processing exhausted retries', {
          ...video,
          ...failureOf(outcome.error),
          processingResult: 'retries_exhausted',
          durationMs,
        });
    }
  };
