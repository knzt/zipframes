import {
  defineMessageHandler,
  type ConsumeHandler,
  type MessageHandlerOptions,
} from '@zipframes/communication';
import { isBaseError } from '@zipframes/core';
import {
  videoUploadedEventSchema,
  type VideoUploadedEvent,
} from '@zipframes/schemas/video-service';

import type { EventPublisher } from '../application/interfaces/gateways/EventPublisher.js';
import type {
  ProcessUploadedVideoUseCase,
  ProcessUploadedVideoUseCaseInput,
  ProcessUploadedVideoUseCaseOutput,
} from '../application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';

export type ProcessUploadedVideoHandlerOptions = MessageHandlerOptions<
  VideoUploadedEvent,
  ProcessUploadedVideoUseCaseOutput
>;

const toJob = (event: VideoUploadedEvent, attempt: number): ProcessUploadedVideoUseCaseInput => ({
  ...event.payload,
  attempt,
  correlationId: event.correlationId,
});

/**
 * Message boundary for `video.uploaded`: `defineMessageHandler` validates the
 * envelope and settles the message; this controller maps the event onto the
 * use case and publishes `video.failed` when attempts run out.
 */
export class ProcessUploadedVideoController {
  readonly handle: ConsumeHandler;

  constructor(
    private readonly processUploadedVideoUseCase: ProcessUploadedVideoUseCase,
    private readonly eventPublisher: EventPublisher,
    options: ProcessUploadedVideoHandlerOptions,
  ) {
    this.handle = defineMessageHandler({
      ...options,
      schema: videoUploadedEventSchema,
      handle: (event, { attempt }) =>
        this.processUploadedVideoUseCase.execute(toJob(event, attempt)),
      onExhausted: (event, error, { attempt }) =>
        this.eventPublisher.publish({
          eventType: 'video.failed',
          correlationId: event.correlationId,
          payload: {
            videoId: event.payload.videoId,
            ownerId: event.payload.ownerId,
            originalFileName: event.payload.originalFileName,
            errorCode: isBaseError(error) ? error.code : 'UNEXPECTED',
            reason: error instanceof Error ? error.message : 'max attempts exhausted',
            attempts: attempt,
          },
        }),
    });
  }
}
