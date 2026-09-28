/**
 * AMQP topology declaration for the notification-service.
 *
 * Queue names, routing keys, retry-without-republishing-to-events and the
 * shared DLX live in `@zipframes/communication` so this service does not
 * copy-paste broker wiring. This file only re-exports that catalog.
 */
export {
  createNotificationConsumerTopology as createNotificationAmqpTopology,
  DEFAULT_EXCHANGE,
  DLQ_QUEUE,
  DLX_EXCHANGE,
  NOTIFICATION_QUEUE,
  NOTIFICATION_RETRY_QUEUE,
  NOTIFICATION_ROUTING_KEYS,
} from '@zipframes/communication';
export { EVENT_EXCHANGE } from '@zipframes/schemas/shared';
