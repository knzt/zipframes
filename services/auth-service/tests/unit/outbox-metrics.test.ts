import { Registry } from 'prom-client';
import { describe, expect, it } from 'vitest';

import { createOutboxMetrics } from '../../src/infrastructure/observability/outboxMetrics.js';

describe('outbox metrics', () => {
  it('counts rows that reached the attempt limit', async () => {
    const registry = new Registry();
    const metrics = createOutboxMetrics(registry);

    metrics.recordExhausted();
    metrics.recordExhausted();

    const text = await registry.metrics();
    expect(text).toContain('outbox_exhausted_total');
    expect(text).toContain('outbox_exhausted_total 2');
  });
});
