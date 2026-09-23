import { createServer, type Server } from 'node:http';

import type { ReadinessResult } from '@zipframes/core';

export interface HealthRoutesDependencies {
  readonly isReady: () => Promise<ReadinessResult>;
  readonly renderMetrics: () => Promise<string>;
}

/** Single HTTP server: /health/live, /health/ready, /metrics. */
export const startHealthServer = (port: number, deps: HealthRoutesDependencies): Server => {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.url === '/health/live') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (req.url === '/health/ready') {
        try {
          const result = await deps.isReady();
          if (result.ready) {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ status: 'ready' }));
            return;
          }
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'not_ready',
              reason: result.reason ?? 'unknown',
            }),
          );
        } catch (error) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              status: 'not_ready',
              reason: error instanceof Error ? error.message : 'unknown',
            }),
          );
        }
        return;
      }

      if (req.url === '/metrics') {
        try {
          const body = await deps.renderMetrics();
          res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
          res.end(body);
        } catch (error) {
          res.writeHead(500);
          res.end(error instanceof Error ? error.message : 'metrics failed');
        }
        return;
      }

      res.writeHead(404);
      res.end('not found');
    })();
  });

  server.listen(port);
  return server;
};
