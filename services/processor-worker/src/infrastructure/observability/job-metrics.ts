import type { TechnicalMetrics } from '@zipframes/telemetry';

import type { JobMetrics } from '../messaging/video-uploaded-consumer.js';
import { UPLOADED_QUEUE } from '../messaging/topology.js';

export const createJobMetrics = (metrics: TechnicalMetrics): JobMetrics => {
  const destination = UPLOADED_QUEUE;
  return {
    recordSuccess: (durationSeconds) => {
      metrics.messagesHandledTotal.inc({ destination, outcome: 'success' });
      metrics.messageDurationSeconds.observe({ destination, outcome: 'success' }, durationSeconds);
    },
    recordPermanentFailure: (durationSeconds) => {
      metrics.messagesHandledTotal.inc({ destination, outcome: 'permanent_failure' });
      metrics.messageDurationSeconds.observe(
        { destination, outcome: 'permanent_failure' },
        durationSeconds,
      );
    },
    recordTransientRetry: (durationSeconds) => {
      metrics.messagesHandledTotal.inc({ destination, outcome: 'transient_retry' });
      metrics.messageDurationSeconds.observe(
        { destination, outcome: 'transient_retry' },
        durationSeconds,
      );
    },
    recordExhausted: (durationSeconds) => {
      metrics.messagesHandledTotal.inc({ destination, outcome: 'exhausted' });
      metrics.messageDurationSeconds.observe(
        { destination, outcome: 'exhausted' },
        durationSeconds,
      );
    },
  };
};
