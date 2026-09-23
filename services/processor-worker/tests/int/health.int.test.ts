import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';

import { createReadinessCheck } from '@zipframes/core';
import type { Pingable, ReadinessResult } from '@zipframes/core';

import { startHealthServer } from '../../src/infrastructure/http/health.routes.js';

const listen = async (server: Server): Promise<number> =>
  new Promise((resolve, reject) => {
    const readPort = (): void => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('expected a TCP port'));
        return;
      }
      resolve(address.port);
    };
    server.once('error', reject);
    if (server.listening) {
      readPort();
      return;
    }
    server.once('listening', readPort);
  });

const close = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const readyChecks = (checks: readonly Pingable[]): (() => Promise<ReadinessResult>) =>
  createReadinessCheck(checks);

describe('health and metrics HTTP', () => {
  it('answers liveness, readiness, metrics and unknown routes on one port', async () => {
    const server = startHealthServer(0, {
      isReady: readyChecks([{ ping: async () => undefined }, { ping: async () => undefined }]),
      renderMetrics: async () => 'frames_packaged 1\n',
    });
    const port = await listen(server);

    try {
      const live = await fetch(`http://127.0.0.1:${String(port)}/health/live`);
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: 'ok' });

      const ready = await fetch(`http://127.0.0.1:${String(port)}/health/ready`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({ status: 'ready' });

      const metrics = await fetch(`http://127.0.0.1:${String(port)}/metrics`);
      expect(metrics.status).toBe(200);
      expect(await metrics.text()).toContain('frames_packaged');

      const missing = await fetch(`http://127.0.0.1:${String(port)}/nope`);
      expect(missing.status).toBe(404);
    } finally {
      await close(server);
    }
  });

  it('reports not ready when a dependency ping fails', async () => {
    const disconnected = startHealthServer(0, {
      isReady: readyChecks([
        {
          ping: async () => {
            throw new Error('amqp disconnected');
          },
        },
      ]),
      renderMetrics: async () => '',
    });
    const storageDown = startHealthServer(0, {
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
    const disconnectedPort = await listen(disconnected);
    const storagePort = await listen(storageDown);

    try {
      const broker = await fetch(`http://127.0.0.1:${String(disconnectedPort)}/health/ready`);
      expect(broker.status).toBe(503);
      expect(await broker.json()).toEqual({ status: 'not_ready', reason: 'amqp disconnected' });

      const storage = await fetch(`http://127.0.0.1:${String(storagePort)}/health/ready`);
      expect(storage.status).toBe(503);
      const body = (await storage.json()) as { status: string; reason: string };
      expect(body.status).toBe('not_ready');
      expect(body.reason).toBe('bucket missing');

      const unknown = startHealthServer(0, {
        isReady: readyChecks([
          {
            ping: async () => {
              // Exercita o ramo em que a falha não é um Error.
              // eslint-disable-next-line @typescript-eslint/only-throw-error
              throw 'offline';
            },
          },
        ]),
        renderMetrics: async () => '',
      });
      const unknownPort = await listen(unknown);
      try {
        const response = await fetch(`http://127.0.0.1:${String(unknownPort)}/health/ready`);
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ status: 'not_ready', reason: 'unknown' });
      } finally {
        await close(unknown);
      }
    } finally {
      await close(disconnected);
      await close(storageDown);
    }
  });

  it('serves a 500 when metrics rendering fails', async () => {
    const failing = startHealthServer(0, {
      isReady: readyChecks([{ ping: async () => undefined }]),
      renderMetrics: async () => {
        throw new Error('registry closed');
      },
    });
    const failingPort = await listen(failing);

    try {
      const broken = await fetch(`http://127.0.0.1:${String(failingPort)}/metrics`);
      expect(broken.status).toBe(500);
      expect(await broken.text()).toBe('registry closed');

      const bareFailure = startHealthServer(0, {
        isReady: readyChecks([{ ping: async () => undefined }]),
        renderMetrics: () => {
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject('offline');
        },
      });
      const barePort = await listen(bareFailure);
      try {
        const bare = await fetch(`http://127.0.0.1:${String(barePort)}/metrics`);
        expect(bare.status).toBe(500);
        expect(await bare.text()).toBe('metrics failed');
      } finally {
        await close(bareFailure);
      }
    } finally {
      await close(failing);
    }
  });
});
