import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { ReadinessResult } from '@zipframes/core';
import type { Logger } from '@zipframes/logger';

/**
 * Health and metrics for a process that has no business HTTP. Prometheus
 * pulls `/metrics` and Kubernetes probes `/health/*`, so both need a port
 * even though work only arrives through the queue. The routes and bodies
 * match the ones the Fastify services expose.
 */
export interface OperationsServerOptions {
  readonly port: number;
  readonly isReady: () => Promise<ReadinessResult>;
  readonly renderMetrics: () => Promise<string>;
  readonly logger?: Logger;
}

export interface OperationsServer {
  /** The bound port; differs from the option when it was 0. */
  readonly port: number;
  readonly close: () => Promise<void>;
}

const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4';
const DEPENDENCY_UNAVAILABLE = 'dependency unavailable';

const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

const sendText = (response: ServerResponse, status: number, body: string): void => {
  response.writeHead(status, { 'content-type': METRICS_CONTENT_TYPE });
  response.end(body);
};

const handle = async (
  options: OperationsServerOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const path = (request.url ?? '/').split('?')[0];

  if (request.method !== 'GET') {
    sendJson(response, 405, { status: 'method_not_allowed' });
    return;
  }

  if (path === '/health/live') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (path === '/health/ready') {
    try {
      const result = await options.isReady();
      if (result.ready) {
        sendJson(response, 200, { status: 'ready' });
        return;
      }
      options.logger?.warn('readiness check reported not ready', { reason: result.reason });
    } catch (error) {
      options.logger?.error('readiness check failed', { err: error });
    }
    sendJson(response, 503, { status: 'not_ready', reason: DEPENDENCY_UNAVAILABLE });
    return;
  }

  if (path === '/metrics') {
    try {
      sendText(response, 200, await options.renderMetrics());
    } catch (error) {
      options.logger?.error('metrics render failed', { err: error });
      sendText(response, 500, 'metrics unavailable');
    }
    return;
  }

  sendJson(response, 404, { status: 'not_found' });
};

export const startOperationsServer = (
  options: OperationsServerOptions,
): Promise<OperationsServer> =>
  new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      void handle(options, request, response);
    });
    server.once('error', reject);
    server.listen(options.port, () => {
      server.off('error', reject);
      resolve({
        port: (server.address() as AddressInfo).port,
        close: () =>
          new Promise<void>((resolveClose, rejectClose) => {
            // Prometheus keeps its connection alive; without this, close()
            // would wait for it and hold up the shutdown.
            server.closeAllConnections();
            server.close((error) => {
              if (error) {
                rejectClose(error);
                return;
              }
              resolveClose();
            });
          }),
      });
    });
  });
