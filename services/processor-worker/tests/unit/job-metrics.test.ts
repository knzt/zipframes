import { createMetrics } from '@zipframes/telemetry';
import { describe, expect, it } from 'vitest';

import { createJobMetrics } from '../../src/infrastructure/observability/jobMetrics.js';

describe('createJobMetrics', () => {
  it('records each job outcome on the shared technical metrics', async () => {
    const metrics = createMetrics({
      service: 'processor-worker-test',
      version: '0.0.0',
      collectDefaults: false,
    });
    const jobs = createJobMetrics(metrics);

    jobs.recordFramesPackaged(0.1);
    jobs.recordMediaRejected(0.2);
    jobs.recordRetryScheduled(0.3);
    jobs.recordRetriesExhausted(0.4);

    const body = await metrics.registry.metrics();
    expect(body).toContain('outcome="success"');
    expect(body).toContain('outcome="permanent_failure"');
    expect(body).toContain('outcome="transient_retry"');
    expect(body).toContain('outcome="exhausted"');
    expect(body).toContain('processor.video.uploaded');
  });
});
