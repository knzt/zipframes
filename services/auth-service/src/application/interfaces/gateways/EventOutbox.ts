import type { UserRegistered } from '../../../domain/events/userRegistered.js';

/**
 * Records an unpublished integration event. The use case does not know the
 * outbox table; mapping to columns and the later AMQP publish live in
 * infrastructure.
 */
export interface EventOutbox {
  readonly record: (event: UserRegistered, correlationId: string) => Promise<void>;
}
