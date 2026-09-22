import type { ConsumeHandler } from '@zipframes/communication';
import { decideRetry, type RetryOptions } from '@zipframes/communication';
import type { Logger } from '@zipframes/logger';
import { runWithCorrelationId } from '@zipframes/logger';
import { parseSchema } from '@zipframes/schemas';
import { videoUploadedEventSchema } from '@zipframes/schemas/video-service';

import type { EventPublisher } from '../../application/gateways/event-publisher.js';
import type { ProcessUploadedVideo } from '../../application/use-cases/process-uploaded-video.js';
import { isProcessingError } from '../../domain/errors.js';

export interface JobMetrics {
  readonly recordSuccess: (durationSeconds: number) => void;
  readonly recordPermanentFailure: (durationSeconds: number) => void;
  readonly recordTransientRetry: (durationSeconds: number) => void;
  readonly recordExhausted: (durationSeconds: number) => void;
}

export interface VideoUploadedConsumerDeps {
  readonly processUploadedVideo: ProcessUploadedVideo;
  readonly events: EventPublisher;
  readonly retry: RetryOptions;
  readonly logger: Logger;
  readonly metrics?: JobMetrics;
}

export const createVideoUploadedConsumer = (deps: VideoUploadedConsumerDeps): ConsumeHandler => {
  return async (message, context) => {
    const started = Date.now();
    const durationSeconds = (): number => (Date.now() - started) / 1000;

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
        const outcome = await deps.processUploadedVideo({
          videoId: event.payload.videoId,
          ownerId: event.payload.ownerId,
          sourceKey: event.payload.sourceKey,
          originalFileName: event.payload.originalFileName,
          sizeBytes: event.payload.sizeBytes,
          attempt: context.attempt,
          correlationId: event.correlationId,
        });
        if (outcome === 'success') {
          deps.metrics?.recordSuccess(durationSeconds());
          deps.logger.info('video processed', {
            videoId: event.payload.videoId,
            ownerId: event.payload.ownerId,
            attempt: context.attempt,
            originalFileName: event.payload.originalFileName,
            sizeBytes: event.payload.sizeBytes,
            outcome: 'success',
            durationMs: Math.round(durationSeconds() * 1000),
          });
        } else {
          deps.metrics?.recordPermanentFailure(durationSeconds());
          deps.logger.warn('video processing failed permanently', {
            videoId: event.payload.videoId,
            ownerId: event.payload.ownerId,
            attempt: context.attempt,
            originalFileName: event.payload.originalFileName,
            outcome: 'permanent_failure',
            durationMs: Math.round(durationSeconds() * 1000),
          });
        }
        await context.ack();
      } catch (error) {
        // Permanent failures return from the use case; anything thrown is transient.
        const code = isProcessingError(error) ? error.code : 'UNEXPECTED';
        const kind = isProcessingError(error) ? error.kind : 'transient';

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
          deps.metrics?.recordExhausted(durationSeconds());
          deps.logger.error('video processing exhausted retries', {
            videoId: event.payload.videoId,
            ownerId: event.payload.ownerId,
            attempt: context.attempt,
            errorCode: code,
            kind,
            outcome: 'exhausted',
            durationMs: Math.round(durationSeconds() * 1000),
          });
          await context.deadLetter();
          return;
        }

        deps.metrics?.recordTransientRetry(durationSeconds());
        deps.logger.warn('video processing failed transiently; scheduling retry', {
          videoId: event.payload.videoId,
          ownerId: event.payload.ownerId,
          attempt: context.attempt,
          errorCode: code,
          kind,
          outcome: 'transient_retry',
          durationMs: Math.round(durationSeconds() * 1000),
        });
        await context.retry();
      }
    });
  };
};
