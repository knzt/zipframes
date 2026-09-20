import type { ConsumeHandler } from '@zipframes/communication';
import { decideRetry, type RetryOptions } from '@zipframes/communication';
import { parseSchema } from '@zipframes/schemas';
import { videoUploadedEventSchema } from '@zipframes/schemas/video-service';

import type { EventPublisher } from '../../application/gateways/event-publisher.js';
import type { ProcessUploadedVideo } from '../../application/use-cases/process-uploaded-video.js';
import { isProcessingError } from '../../domain/errors.js';

export interface VideoUploadedConsumerDeps {
  readonly processUploadedVideo: ProcessUploadedVideo;
  readonly events: EventPublisher;
  readonly retry: RetryOptions;
}

export const createVideoUploadedConsumer = (deps: VideoUploadedConsumerDeps): ConsumeHandler => {
  return async (message, context) => {
    const parsed = parseSchema(videoUploadedEventSchema, message.envelope);
    if (!parsed.ok) {
      await context.deadLetter();
      return;
    }

    const event = parsed.value;
    try {
      await deps.processUploadedVideo({
        videoId: event.payload.videoId,
        ownerId: event.payload.ownerId,
        sourceKey: event.payload.sourceKey,
        originalFileName: event.payload.originalFileName,
        sizeBytes: event.payload.sizeBytes,
        attempt: context.attempt,
        correlationId: event.correlationId,
      });
      await context.ack();
    } catch (error) {
      const transient = !isProcessingError(error) || error.kind === 'transient';
      if (!transient) {
        await context.ack();
        return;
      }

      if (decideRetry(context.attempt, deps.retry) === 'dlq') {
        await deps.events.publish({
          eventType: 'video.failed',
          correlationId: event.correlationId,
          payload: {
            videoId: event.payload.videoId,
            ownerId: event.payload.ownerId,
            errorCode: isProcessingError(error) ? error.code : 'MAX_ATTEMPTS',
            reason: error instanceof Error ? error.message : 'max attempts exhausted',
            attempts: context.attempt,
          },
        });
        await context.deadLetter();
        return;
      }

      await context.retry();
    }
  };
};
