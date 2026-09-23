import { createCorrelationId, getCorrelationId } from '@zipframes/logger';

/**
 * The id that ties the published registration to the request that caused it.
 * The HTTP adapter stores the incoming id in the async context. This reads
 * it when the outbox row is written, and mints one when the request had none.
 */
export const correlationIdForRegistration = (): string =>
  getCorrelationId() ?? createCorrelationId();
