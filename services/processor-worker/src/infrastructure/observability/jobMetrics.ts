import type { TechnicalMetrics } from '@zipframes/telemetry';

import type { JobMetrics } from '../messaging/videoUploadedConsumer.js';
import { UPLOADED_QUEUE } from '../messaging/topology.js';

export const createJobMetrics = (metrics: TechnicalMetrics): JobMetrics => {
  const destination = UPLOADED_QUEUE;
  return {
    recordFramesPackaged: (durationSeconds) => {
      metrics.messagesHandledTotal.inc({ destination, outcome: 'success' });
      metrics.messageDurationSeconds.observe({ destination, outcome: 'success' }, durationSeconds);
    },
    recordMediaRejected: (durationSeconds) => {
      metrics.messagesHandledTotal.inc({ destination, outcome: 'permanent_failure' });
      metrics.messageDurationSeconds.observe(
        { destination, outcome: 'permanent_failure' },
        durationSeconds,
      );
    },
    recordRetryScheduled: (durationSeconds) => {
      metrics.messagesHandledTotal.inc({ destination, outcome: 'transient_retry' });
      metrics.messageDurationSeconds.observe(
        { destination, outcome: 'transient_retry' },
        durationSeconds,
      );
    },
    recordRetriesExhausted: (durationSeconds) => {
      metrics.messagesHandledTotal.inc({ destination, outcome: 'exhausted' });
      metrics.messageDurationSeconds.observe(
        { destination, outcome: 'exhausted' },
        durationSeconds,
      );
    },
  };
};
