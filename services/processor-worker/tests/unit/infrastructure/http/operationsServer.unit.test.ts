import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReadinessResult } from '@zipframes/core';
import type { Logger } from '@zipframes/logger';

import {
  startOperationsServer,
  type OperationsServer,
} from '../../../../src/infrastructure/http/operationsServer.js';

const logger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
});

let server: OperationsServer | undefined;

const start = async (overrides: {
  isReady?: () => Promise<ReadinessResult>;
  renderMetrics?: () => Promise<string>;
  logger?: Logger;
}): Promise<string> => {
  server = await startOperationsServer({
    port: 0,
    isReady: overrides.isReady ?? (() => Promise.resolve({ ready: true })),
    renderMetrics: overrides.renderMetrics ?? (() => Promise.resolve('# metrics\n')),
    ...(overrides.logger ? { logger: overrides.logger } : {}),
  });
  return `http://127.0.0.1:${String(server.port)}`;
};

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('operations server', () => {
  it('answers liveness', async () => {
    const base = await start({});

    const response = await fetch(`${base}/health/live`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('answers ready when every dependency is reachable', async () => {
    const base = await start({});

    const response = await fetch(`${base}/health/ready`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
  });

  it('answers 503 without the internal reason when a dependency is down', async () => {
    const log = logger();
    const base = await start({
      isReady: () => Promise.resolve({ ready: false, reason: 'amqp disconnected' }),
      logger: log,
    });

    const response = await fetch(`${base}/health/ready`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'not_ready',
      reason: 'dependency unavailable',
    });
    expect(log.warn).toHaveBeenCalledWith('readiness check reported not ready', {
      reason: 'amqp disconnected',
    });
  });

  it('answers 503 when the readiness check throws', async () => {
    const log = logger();
    const base = await start({
      isReady: () => Promise.reject(new Error('boom')),
      logger: log,
    });

    const response = await fetch(`${base}/health/ready`);

    expect(response.status).toBe(503);
    expect(log.error).toHaveBeenCalledWith('readiness check failed', expect.anything());
  });

  it('serves the metrics as Prometheus text', async () => {
    const base = await start({ renderMetrics: () => Promise.resolve('up 1\n') });

    const response = await fetch(`${base}/metrics?ignored=1`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; version=0.0.4');
    expect(await response.text()).toBe('up 1\n');
  });

  it('answers 500 when the metrics cannot be rendered', async () => {
    const log = logger();
    const base = await start({
      renderMetrics: () => Promise.reject(new Error('registry broken')),
      logger: log,
    });

    const response = await fetch(`${base}/metrics`);

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('metrics unavailable');
    expect(log.error).toHaveBeenCalledWith('metrics render failed', expect.anything());
  });

  it('answers 404 for any other path and 405 for other methods', async () => {
    const base = await start({});

    expect((await fetch(`${base}/videos`)).status).toBe(404);
    expect((await fetch(`${base}/metrics`, { method: 'POST' })).status).toBe(405);
  });

  it('rejects when the port is taken', async () => {
    await start({});
    const taken = server?.port ?? 0;

    await expect(
      startOperationsServer({
        port: taken,
        isReady: () => Promise.resolve({ ready: true }),
        renderMetrics: () => Promise.resolve(''),
      }),
    ).rejects.toThrow();
  });
});
