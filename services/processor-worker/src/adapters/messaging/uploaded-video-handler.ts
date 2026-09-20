import type { ConsumeHandler, Publisher } from '@zipframes/communication';
import { decideRetry, type RetryOptions } from '@zipframes/communication';
import { parseSchema } from '@zipframes/schemas';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';
import { videoUploadedEventSchema } from '@zipframes/schemas/video-service';

import type { ProcessUploadedVideo } from '../../application/process-uploaded-video.js';
import { isProcessingError } from '../../domain/errors.js';

export interface UploadedHandlerDeps {
  readonly processUploadedVideo: ProcessUploadedVideo;
  readonly publisher: Publisher;
  readonly retry: RetryOptions;
  readonly createId: () => string;
  readonly now: () => Date;
}

export const createUploadedVideoHandler = (deps: UploadedHandlerDeps): ConsumeHandler => {
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
        await deps.publisher.publish(
          {
            eventId: deps.createId(),
            eventType: 'video.failed',
            version: 1,
            occurredAt: deps.now().toISOString(),
            correlationId: event.correlationId,
            payload: {
              videoId: event.payload.videoId,
              ownerId: event.payload.ownerId,
              errorCode: isProcessingError(error) ? error.code : 'MAX_ATTEMPTS',
              reason: error instanceof Error ? error.message : 'max attempts exhausted',
              attempts: context.attempt,
            },
          },
          { exchange: EVENT_EXCHANGE, routingKey: 'video.failed' },
        );
        await context.deadLetter();
        return;
      }

      await context.retry();
    }
  };
};
