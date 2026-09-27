import { createLogger } from '@zipframes/logger';
import type { Logger } from '@zipframes/logger';

/** Logger that discards output, for tests that still need one. */
export const silentLogger = (): Logger =>
  createLogger({
    service: 'video-service-test',
    version: '0.0.0',
    level: 'error',
    destination: { write: () => undefined },
  });
