import { createServer, type Server } from 'node:http';

export interface HealthChecks {
  readonly isAmqpConnected: () => boolean;
  readonly pingStorage: () => Promise<void>;
}

export const startHealthServer = (port: number, checks: HealthChecks): Server => {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.url === '/healthz' || req.url === '/livez') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (req.url === '/readyz') {
        try {
          if (!checks.isAmqpConnected()) {
            throw new Error('amqp disconnected');
          }
          await checks.pingStorage();
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ status: 'ready' }));
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
        res.writeHead(404);
        res.end('use /metrics on the metrics port');
        return;
      }

      res.writeHead(404);
      res.end('not found');
    })();
  });

  server.listen(port);
  return server;
};

export const startMetricsServer = (port: number, renderMetrics: () => Promise<string>): Server => {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.url !== '/metrics') {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      try {
        const body = await renderMetrics();
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
        res.end(body);
      } catch (error) {
        res.writeHead(500);
        res.end(error instanceof Error ? error.message : 'metrics failed');
      }
    })();
  });
  server.listen(port);
  return server;
};
