import type { BrokerMessage, ConsumeContext, ConsumeHandler } from '@zipframes/communication';
import type { Logger } from '@zipframes/logger';
import { runWithCorrelationId } from '@zipframes/logger';

import type {
  ProcessUploadedVideoController,
  ProcessUploadedVideoDecision,
} from '../../../interface-adapters/ProcessUploadedVideoController.js';

export interface JobMetrics {
  readonly recordFramesPackaged: (durationSeconds: number) => void;
  readonly recordMediaRejected: (durationSeconds: number) => void;
  readonly recordRetryScheduled: (durationSeconds: number) => void;
  readonly recordRetriesExhausted: (durationSeconds: number) => void;
}

export interface VideoUploadedConsumerDeps {
  readonly controller: ProcessUploadedVideoController;
  readonly logger: Logger;
  readonly metrics?: JobMetrics;
}

/** Read before validation so the whole handling runs under the message's correlation id. */
const correlationIdOf = (envelope: unknown): string | undefined => {
  if (typeof envelope !== 'object' || envelope === null) {
    return undefined;
  }
  const { correlationId } = envelope as { readonly correlationId?: unknown };
  return typeof correlationId === 'string' ? correlationId : undefined;
};

const observe = (
  decision: ProcessUploadedVideoDecision,
  attempt: number,
  durationSeconds: number,
  deps: VideoUploadedConsumerDeps,
): void => {
  const durationMs = Math.round(durationSeconds * 1000);

  if (decision.action === 'dead_letter' && decision.reason === 'poison') {
    deps.logger.warn('poison video.uploaded message', { attempt, issues: decision.issues });
    return;
  }

  const { event } = decision;
  const video = { videoId: event.payload.videoId, ownerId: event.payload.ownerId, attempt };

  if (decision.action === 'ack') {
    const processingResult = decision.outcome;
    if (processingResult === 'frames_packaged') {
      deps.metrics?.recordFramesPackaged(durationSeconds);
      deps.logger.info('video processed', {
        ...video,
        originalFileName: event.payload.originalFileName,
        sizeBytes: event.payload.sizeBytes,
        processingResult,
        durationMs,
      });
    } else {
      deps.metrics?.recordMediaRejected(durationSeconds);
      deps.logger.warn('video processing rejected the media', {
        ...video,
        originalFileName: event.payload.originalFileName,
        processingResult,
        durationMs,
      });
    }
    return;
  }

  if (decision.action === 'retry') {
    deps.metrics?.recordRetryScheduled(durationSeconds);
    deps.logger.warn('video processing failed transiently; scheduling retry', {
      ...video,
      ...decision.failure,
      processingResult: 'retry_scheduled',
      durationMs,
    });
    return;
  }

  deps.metrics?.recordRetriesExhausted(durationSeconds);
  deps.logger.error('video processing exhausted retries', {
    ...video,
    ...decision.failure,
    processingResult: 'retries_exhausted',
    durationMs,
  });
};

const settle = (decision: ProcessUploadedVideoDecision, context: ConsumeContext): Promise<void> => {
  switch (decision.action) {
    case 'ack':
      return context.ack();
    case 'retry':
      return context.retry();
    case 'dead_letter':
      return context.deadLetter();
  }
};

export const createVideoUploadedConsumer = (deps: VideoUploadedConsumerDeps): ConsumeHandler => {
  return async (message: BrokerMessage, context: ConsumeContext) => {
    const started = Date.now();

    const run = async (): Promise<void> => {
      const decision = await deps.controller.handle({
        envelope: message.envelope,
        attempt: context.attempt,
      });
      observe(decision, context.attempt, (Date.now() - started) / 1000, deps);
      await settle(decision, context);
    };

    const correlationId = correlationIdOf(message.envelope);
    await (correlationId === undefined ? run() : runWithCorrelationId(correlationId, run));
  };
};
