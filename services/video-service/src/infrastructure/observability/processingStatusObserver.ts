import type { MessageOutcome, MessageOutcomeContext } from '@zipframes/communication';
import { isBaseError } from '@zipframes/core';
import type { Logger } from '@zipframes/logger';
import type { TechnicalMetrics } from '@zipframes/telemetry';

import type { ApplyProcessingEventUseCaseOutput } from '../../application/useCases/applyProcessingEvent/ApplyProcessingEventUseCase.js';
import type { ProcessingStatusEvent } from '../../interface-adapters/ApplyProcessingEventController.js';
import { PROCESSING_STATUS_QUEUE } from '../messaging/amqplib/amqpTopology.js';

export type ProcessingStatusOutcome = MessageOutcome<
  ProcessingStatusEvent,
  ApplyProcessingEventUseCaseOutput
>;

type MetricOutcome = 'applied' | 'ignored' | 'unknown_video' | 'retry' | 'exhausted' | 'poison';

const errorCodeOf = (error: unknown): string => (isBaseError(error) ? error.code : 'UNEXPECTED');

/**
 * Logs and counts each settled status message. Logs carry identifiers only,
 * never the failure text the worker wrote for the owner.
 */
export const createProcessingStatusObserver =
  (deps: { readonly logger: Logger; readonly metrics?: TechnicalMetrics }) =>
  (outcome: ProcessingStatusOutcome, { attempt, durationMs }: MessageOutcomeContext): void => {
    const record = (metricOutcome: MetricOutcome): void => {
      const labels = { destination: PROCESSING_STATUS_QUEUE, outcome: metricOutcome };
      deps.metrics?.messagesHandledTotal.inc(labels);
      deps.metrics?.messageDurationSeconds.observe(labels, durationMs / 1000);
    };

    if (outcome.kind === 'poison') {
      record('poison');
      deps.logger.warn('poison processing status message', { attempt, issues: outcome.error });
      return;
    }

    const message = {
      eventType: outcome.event.eventType,
      videoId: outcome.event.payload.videoId,
      attempt,
      durationMs,
    };

    switch (outcome.kind) {
      case 'handled':
        record(outcome.result.kind);
        if (outcome.result.kind === 'applied') {
          deps.logger.info('processing status applied', {
            ...message,
            status: outcome.result.status,
          });
        } else if (outcome.result.kind === 'ignored') {
          deps.logger.info('processing status ignored', {
            ...message,
            reason: outcome.result.reason,
          });
        } else {
          deps.logger.warn('processing status for an unknown video', message);
        }
        return;
      case 'retry':
        record('retry');
        deps.logger.warn('processing status failed; scheduling retry', {
          ...message,
          errorCode: errorCodeOf(outcome.error),
        });
        return;
      case 'exhausted':
        record('exhausted');
        deps.logger.error('processing status exhausted retries', {
          ...message,
          errorCode: errorCodeOf(outcome.error),
        });
    }
  };
