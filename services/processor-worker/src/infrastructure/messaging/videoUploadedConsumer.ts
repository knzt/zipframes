import type { BrokerMessage, ConsumeContext, ConsumeHandler } from '@zipframes/communication';
import { decideRetry, type RetryOptions } from '@zipframes/communication';
import { isBaseError, isRetryableError } from '@zipframes/core';
import type { Logger } from '@zipframes/logger';
import { runWithCorrelationId } from '@zipframes/logger';
import { parseSchema } from '@zipframes/schemas';
import { videoUploadedEventSchema } from '@zipframes/schemas/video-service';

import type { ProcessUploadedVideoController } from '../../interface-adapters/ProcessUploadedVideoController.js';
import type { EventPublisher } from '../../application/interfaces/gateways/EventPublisher.js';

export interface JobMetrics {
  readonly recordFramesPackaged: (durationSeconds: number) => void;
  readonly recordMediaRejected: (durationSeconds: number) => void;
  readonly recordRetryScheduled: (durationSeconds: number) => void;
  readonly recordRetriesExhausted: (durationSeconds: number) => void;
}

export interface VideoUploadedConsumerDeps {
  readonly controller: ProcessUploadedVideoController;
  readonly events: EventPublisher;
  readonly retry: RetryOptions;
  readonly logger: Logger;
  readonly metrics?: JobMetrics;
}

export const createVideoUploadedConsumer = (deps: VideoUploadedConsumerDeps): ConsumeHandler => {
  return async (message: BrokerMessage, context: ConsumeContext) => {
    const started = Date.now();
    const elapsedSeconds = (): number => (Date.now() - started) / 1000;

    const parsed = parseSchema(videoUploadedEventSchema, message.envelope);
    if (!parsed.ok) {
      deps.logger.warn('poison video.uploaded message', {
        attempt: context.attempt,
        issues: parsed.error,
      });
      await context.deadLetter();
      return;
    }

    const event = parsed.value;

    await runWithCorrelationId(event.correlationId, async () => {
      try {
        const processingResult = await deps.controller.handle({
          event,
          attempt: context.attempt,
        });
        if (processingResult === 'frames_packaged') {
          deps.metrics?.recordFramesPackaged(elapsedSeconds());
          deps.logger.info('video processed', {
            videoId: event.payload.videoId,
            ownerId: event.payload.ownerId,
            attempt: context.attempt,
            originalFileName: event.payload.originalFileName,
            sizeBytes: event.payload.sizeBytes,
            processingResult,
            durationMs: Math.round(elapsedSeconds() * 1000),
          });
        } else {
          deps.metrics?.recordMediaRejected(elapsedSeconds());
          deps.logger.warn('video processing rejected the media', {
            videoId: event.payload.videoId,
            ownerId: event.payload.ownerId,
            attempt: context.attempt,
            originalFileName: event.payload.originalFileName,
            processingResult,
            durationMs: Math.round(elapsedSeconds() * 1000),
          });
        }
        await context.ack();
      } catch (error) {
        const code = isBaseError(error) ? error.code : 'UNEXPECTED';
        const retryable = isRetryableError(error);

        if (decideRetry(context.attempt, deps.retry) === 'dlq') {
          await deps.events.publish({
            eventType: 'video.failed',
            correlationId: event.correlationId,
            payload: {
              videoId: event.payload.videoId,
              ownerId: event.payload.ownerId,
              errorCode: code,
              reason: error instanceof Error ? error.message : 'max attempts exhausted',
              attempts: context.attempt,
            },
          });
          deps.metrics?.recordRetriesExhausted(elapsedSeconds());
          deps.logger.error('video processing exhausted retries', {
            videoId: event.payload.videoId,
            ownerId: event.payload.ownerId,
            attempt: context.attempt,
            errorCode: code,
            retryable,
            processingResult: 'retries_exhausted',
            durationMs: Math.round(elapsedSeconds() * 1000),
          });
          await context.deadLetter();
          return;
        }

        deps.metrics?.recordRetryScheduled(elapsedSeconds());
        deps.logger.warn('video processing failed transiently; scheduling retry', {
          videoId: event.payload.videoId,
          ownerId: event.payload.ownerId,
          attempt: context.attempt,
          errorCode: code,
          retryable,
          processingResult: 'retry_scheduled',
          durationMs: Math.round(elapsedSeconds() * 1000),
        });
        await context.retry();
      }
    });
  };
};
