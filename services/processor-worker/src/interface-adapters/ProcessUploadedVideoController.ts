import { decideRetry, type RetryOptions } from '@zipframes/communication';
import { isBaseError, isRetryableError } from '@zipframes/core';
import { parseSchema } from '@zipframes/schemas';
import {
  videoUploadedEventSchema,
  type VideoUploadedEvent,
} from '@zipframes/schemas/video-service';

import type { EventPublisher } from '../application/interfaces/gateways/EventPublisher.js';
import type {
  ProcessUploadedVideoUseCase,
  ProcessUploadedVideoUseCaseOutput,
} from '../application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';

export interface ProcessUploadedVideoControllerRequest {
  readonly envelope: unknown;
  readonly attempt: number;
}

export interface ProcessingFailure {
  readonly errorCode: string;
  readonly retryable: boolean;
}

/**
 * What the transport must do with the message. The consumer maps each action
 * onto ack, retry or dead-letter; the controller never sees AMQP.
 */
export type ProcessUploadedVideoDecision =
  | {
      readonly action: 'ack';
      readonly event: VideoUploadedEvent;
      readonly outcome: ProcessUploadedVideoUseCaseOutput;
    }
  | {
      readonly action: 'retry';
      readonly event: VideoUploadedEvent;
      readonly failure: ProcessingFailure;
    }
  | {
      readonly action: 'dead_letter';
      readonly reason: 'retries_exhausted';
      readonly event: VideoUploadedEvent;
      readonly failure: ProcessingFailure;
    }
  | {
      readonly action: 'dead_letter';
      readonly reason: 'poison';
      readonly issues: unknown;
    };

/**
 * Decodes a `video.uploaded` envelope, calls the use case and decides whether
 * the message is done, retried or dead-lettered. When attempts are exhausted
 * it publishes `video.failed` before asking for the dead-letter.
 */
export class ProcessUploadedVideoController {
  constructor(
    private readonly processUploadedVideoUseCase: ProcessUploadedVideoUseCase,
    private readonly eventPublisher: EventPublisher,
    private readonly retry: RetryOptions,
  ) {}

  async handle(
    request: ProcessUploadedVideoControllerRequest,
  ): Promise<ProcessUploadedVideoDecision> {
    const parsed = parseSchema(videoUploadedEventSchema, request.envelope);
    if (!parsed.ok) {
      return { action: 'dead_letter', reason: 'poison', issues: parsed.error };
    }

    const event = parsed.value;
    const { attempt } = request;

    try {
      const outcome = await this.processUploadedVideoUseCase.execute({
        videoId: event.payload.videoId,
        ownerId: event.payload.ownerId,
        sourceKey: event.payload.sourceKey,
        originalFileName: event.payload.originalFileName,
        sizeBytes: event.payload.sizeBytes,
        attempt,
        correlationId: event.correlationId,
      });
      return { action: 'ack', event, outcome };
    } catch (error) {
      const failure: ProcessingFailure = {
        errorCode: isBaseError(error) ? error.code : 'UNEXPECTED',
        retryable: isRetryableError(error),
      };

      if (decideRetry(attempt, this.retry) !== 'dlq') {
        return { action: 'retry', event, failure };
      }

      await this.eventPublisher.publish({
        eventType: 'video.failed',
        correlationId: event.correlationId,
        payload: {
          videoId: event.payload.videoId,
          ownerId: event.payload.ownerId,
          errorCode: failure.errorCode,
          reason: error instanceof Error ? error.message : 'max attempts exhausted',
          attempts: attempt,
        },
      });
      return { action: 'dead_letter', reason: 'retries_exhausted', event, failure };
    }
  }
}
