import type { MessageOutcome, MessageOutcomeContext } from '@zipframes/communication';
import type { Logger } from '@zipframes/logger';
import type { TechnicalMetrics } from '@zipframes/telemetry';

export const recordNotificationOutcome =
  (deps: {
    readonly logger: Logger;
    readonly metrics: TechnicalMetrics;
    readonly destination: string;
  }) =>
  (
    outcome: MessageOutcome<unknown, unknown>,
    { attempt, durationMs }: MessageOutcomeContext,
  ): void => {
    const destination = deps.destination;
    const durationSeconds = durationMs / 1000;
    const kind = outcome.kind;
    deps.metrics.messagesHandledTotal.inc({ destination, outcome: kind });
    deps.metrics.messageDurationSeconds.observe({ destination, outcome: kind }, durationSeconds);

    if (kind === 'poison') {
      deps.logger.warn('poison notification message', { attempt, issues: outcome.error });
      return;
    }
    if (kind === 'retry') {
      deps.logger.warn('notification delivery will retry', { attempt });
      return;
    }
    if (kind === 'exhausted') {
      deps.logger.error('notification delivery exhausted', { attempt });
      return;
    }
    deps.logger.info('notification message handled', { attempt });
  };
