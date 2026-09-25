import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';

import { createReadinessCheck } from '@zipframes/core';
import type { Pingable, ReadinessResult } from '@zipframes/core';

import {
  createHealthApp,
  startHealthServer,
} from '../../../../src/infrastructure/http/health.routes.js';

const readyChecks = (checks: readonly Pingable[]): (() => Promise<ReadinessResult>) =>
  createReadinessCheck(checks);

const listeningPort = (app: { server: { address: () => string | AddressInfo | null } }): number => {
  const address = app.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('expected a TCP port');
  }
  return address.port;
};

describe('health and metrics HTTP', () => {
  it('answers liveness, readiness and metrics on Fastify', async () => {
    const app = await createHealthApp({
      isReady: readyChecks([{ ping: async () => undefined }, { ping: async () => undefined }]),
      renderMetrics: async () => 'frames_packaged 1\n',
    });

    const live = await app.inject({ method: 'GET', url: '/health/live' });
    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: 'ok' });

    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready' });

    const metrics = await app.inject({ method: 'GET', url: '/metrics' });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers['content-type']).toContain('text/plain');
    expect(metrics.body).toContain('frames_packaged');

    const missing = await app.inject({ method: 'GET', url: '/nope' });
    expect(missing.statusCode).toBe(404);

    await app.close();
  });

  it('listens on the health port', async () => {
    const app = await startHealthServer(0, {
      isReady: readyChecks([{ ping: async () => undefined }]),
      renderMetrics: async () => '',
    });

    try {
      const response = await fetch(`http://127.0.0.1:${String(listeningPort(app))}/health/live`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  });

  it('reports not ready when a dependency ping fails', async () => {
    const disconnected = await createHealthApp({
      isReady: readyChecks([
        {
          ping: async () => {
            throw new Error('amqp disconnected');
          },
        },
      ]),
      renderMetrics: async () => '',
    });
    const storageDown = await createHealthApp({
      isReady: readyChecks([
        { ping: async () => undefined },
        {
          ping: async () => {
            throw new Error('bucket missing');
          },
        },
      ]),
      renderMetrics: async () => '',
    });

    try {
      const broker = await disconnected.inject({ method: 'GET', url: '/health/ready' });
      expect(broker.statusCode).toBe(503);
      expect(broker.json()).toEqual({ status: 'not_ready', reason: 'dependency unavailable' });

      const storage = await storageDown.inject({ method: 'GET', url: '/health/ready' });
      expect(storage.statusCode).toBe(503);
      expect(storage.json()).toEqual({ status: 'not_ready', reason: 'dependency unavailable' });
    } finally {
      await disconnected.close();
      await storageDown.close();
    }
  });

  it('reports an unknown reason when the failure is not an Error', async () => {
    const app = await createHealthApp({
      isReady: readyChecks([
        {
          ping: async () => {
            // Exercises the branch where the failure is not an Error.
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw 'offline';
          },
        },
      ]),
      renderMetrics: async () => '',
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'not_ready', reason: 'dependency unavailable' });
    } finally {
      await app.close();
    }
  });

  it('serves a 500 when metrics rendering fails', async () => {
    const failing = await createHealthApp({
      isReady: readyChecks([{ ping: async () => undefined }]),
      renderMetrics: async () => {
        throw new Error('registry closed');
      },
    });

    try {
      const broken = await failing.inject({ method: 'GET', url: '/metrics' });
      expect(broken.statusCode).toBe(500);
      expect(broken.body).toBe('metrics unavailable');
    } finally {
      await failing.close();
    }

    const bareFailure = await createHealthApp({
      isReady: readyChecks([{ ping: async () => undefined }]),
      renderMetrics: () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject('offline');
      },
    });

    try {
      const bare = await bareFailure.inject({ method: 'GET', url: '/metrics' });
      expect(bare.statusCode).toBe(500);
      expect(bare.body).toBe('metrics unavailable');
    } finally {
      await bareFailure.close();
    }
  });

  it('serves an OpenAPI document generated from the health schemas', async () => {
    const app = await createHealthApp({
      isReady: readyChecks([{ ping: async () => undefined }]),
      renderMetrics: async () => '',
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/docs/json' });
      expect(response.statusCode).toBe(200);
      const document: { openapi: string; paths: Record<string, unknown> } = response.json();
      expect(document.openapi).toMatch(/^3\./);
      expect(document.paths['/health/live']).toBeDefined();
      expect(document.paths['/health/ready']).toBeDefined();
      expect(document.paths['/metrics']).toBeDefined();

      const ui = await app.inject({ method: 'GET', url: '/docs' });
      expect(ui.statusCode).toBe(200);
      expect(ui.headers['content-type']).toContain('text/html');
    } finally {
      await app.close();
    }
  });
});
