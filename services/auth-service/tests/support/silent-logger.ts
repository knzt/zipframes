import { createLogger } from '@zipframes/logger';
import type { Logger } from '@zipframes/logger';

/** Logger that discards output, for HTTP tests that still need the error handler. */
export const silentLogger = (): Logger =>
  createLogger({
    service: 'auth-service-test',
    version: '0.0.0',
    level: 'error',
    destination: { write: () => undefined },
  });
