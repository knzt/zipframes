import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';

import { startHealthServer, startMetricsServer } from '../../src/infrastructure/http/health.js';

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

describe('health and metrics HTTP', () => {
  it('answers liveness, readiness and unknown routes', async () => {
    const server = startHealthServer(0, {
      isAmqpConnected: () => true,
      pingStorage: async () => undefined,
    });
    const port = await listen(server);

    try {
      const live = await fetch(`http://127.0.0.1:${String(port)}/livez`);
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: 'ok' });

      const ready = await fetch(`http://127.0.0.1:${String(port)}/readyz`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({ status: 'ready' });

      const metricsHint = await fetch(`http://127.0.0.1:${String(port)}/metrics`);
      expect(metricsHint.status).toBe(404);

      const missing = await fetch(`http://127.0.0.1:${String(port)}/nope`);
      expect(missing.status).toBe(404);
    } finally {
      await close(server);
    }
  });

  it('reports not ready when the broker or the bucket is unreachable', async () => {
    const disconnected = startHealthServer(0, {
      isAmqpConnected: () => false,
      pingStorage: async () => undefined,
    });
    const storageDown = startHealthServer(0, {
      isAmqpConnected: () => true,
      pingStorage: async () => {
        throw new Error('bucket missing');
      },
    });
    const disconnectedPort = await listen(disconnected);
    const storagePort = await listen(storageDown);

    try {
      const broker = await fetch(`http://127.0.0.1:${String(disconnectedPort)}/readyz`);
      expect(broker.status).toBe(503);
      expect(await broker.json()).toEqual({ status: 'not_ready', reason: 'amqp disconnected' });

      const storage = await fetch(`http://127.0.0.1:${String(storagePort)}/readyz`);
      expect(storage.status).toBe(503);
      const body = (await storage.json()) as { status: string; reason: string };
      expect(body.status).toBe('not_ready');
      expect(body.reason).toBe('bucket missing');

      const unknown = startHealthServer(0, {
        isAmqpConnected: () => true,
        pingStorage: async () => {
          // Exercita o ramo em que a falha não é um Error.
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'offline';
        },
      });
      const unknownPort = await listen(unknown);
      try {
        const response = await fetch(`http://127.0.0.1:${String(unknownPort)}/readyz`);
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

  it('serves metrics text and a 500 when rendering fails', async () => {
    const ok = startMetricsServer(0, async () => 'frames_packaged 1\n');
    const failing = startMetricsServer(0, async () => {
      throw new Error('registry closed');
    });
    const okPort = await listen(ok);
    const failingPort = await listen(failing);

    try {
      const metrics = await fetch(`http://127.0.0.1:${String(okPort)}/metrics`);
      expect(metrics.status).toBe(200);
      expect(await metrics.text()).toContain('frames_packaged');

      const missing = await fetch(`http://127.0.0.1:${String(okPort)}/livez`);
      expect(missing.status).toBe(404);

      const broken = await fetch(`http://127.0.0.1:${String(failingPort)}/metrics`);
      expect(broken.status).toBe(500);
      expect(await broken.text()).toBe('registry closed');

      const bareFailure = startMetricsServer(0, () => {
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject('offline');
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
      await close(ok);
      await close(failing);
    }
  });
});
