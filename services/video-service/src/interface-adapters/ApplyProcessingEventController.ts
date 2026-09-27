import {
  defineMessageHandler,
  type ConsumeHandler,
  type MessageHandlerOptions,
} from '@zipframes/communication';
import { processorWorker } from '@zipframes/schemas';
import { z } from 'zod';

import type {
  ApplyProcessingEventUseCase,
  ApplyProcessingEventUseCaseInput,
  ApplyProcessingEventUseCaseOutput,
} from '../application/useCases/applyProcessingEvent/ApplyProcessingEventUseCase.js';

/** The three events the worker publishes about a video, told apart by `eventType`. */
export const processingStatusEventSchema = z.discriminatedUnion('eventType', [
  processorWorker.videoProcessingStartedEventSchema,
  processorWorker.videoProcessedEventSchema,
  processorWorker.videoFailedEventSchema,
]);

export type ProcessingStatusEvent = z.infer<typeof processingStatusEventSchema>;

export type ApplyProcessingEventHandlerOptions = MessageHandlerOptions<
  ProcessingStatusEvent,
  ApplyProcessingEventUseCaseOutput
>;

export const toApplyProcessingEventInput = (
  event: ProcessingStatusEvent,
): ApplyProcessingEventUseCaseInput => {
  const { videoId } = event.payload;
  switch (event.eventType) {
    case 'video.processing.started':
      return { videoId, event: { kind: 'started' } };
    case 'video.processed':
      return {
        videoId,
        event: {
          kind: 'completed',
          resultKey: event.payload.resultKey,
          frameCount: event.payload.frameCount,
        },
      };
    case 'video.failed':
      return {
        videoId,
        event: { kind: 'failed', errorCode: event.payload.errorCode, reason: event.payload.reason },
      };
  }
};

/**
 * Message boundary for the worker's status events: `defineMessageHandler`
 * validates the envelope and settles the message; this controller maps the
 * event onto the use case. A message that exhausts its attempts goes to the
 * DLQ with nothing else to publish.
 */
export class ApplyProcessingEventController {
  readonly handle: ConsumeHandler;

  constructor(
    private readonly applyProcessingEventUseCase: ApplyProcessingEventUseCase,
    options: ApplyProcessingEventHandlerOptions,
  ) {
    this.handle = defineMessageHandler({
      ...options,
      schema: processingStatusEventSchema,
      handle: (event) =>
        this.applyProcessingEventUseCase.execute(toApplyProcessingEventInput(event)),
    });
  }
}
