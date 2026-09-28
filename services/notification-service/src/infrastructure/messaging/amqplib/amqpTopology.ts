/**
 * AMQP topology declaration for the notification-service.
 *
 * This is the list of exchanges, queues, and bindings this process
 * asserts at boot so consume/publish do not race an undeclared broker
 * object. The retry queue uses TTL + DLX to return an expired retry
 * straight to the main queue through the default exchange: sending it
 * back through `zipframes.events` would hand every retry to any other
 * subscriber of `video.failed` / identity events too. The main queue
 * dead-letters to the shared DLQ. Assertion itself lives on the
 * connection (`assertTopology`); this file only declares what to assert.
 * It is not a layer.
 */
import type { Topology } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

export { EVENT_EXCHANGE };

export const NOTIFICATION_QUEUE = 'notification-service.events';
/**
 * Replaces a wait queue that would dead-letter into the events exchange.
 * A new name, because a broker refuses to redeclare an existing queue
 * with different arguments.
 */
export const NOTIFICATION_RETRY_QUEUE = 'notification-service.events.retry';
export const DLX_EXCHANGE = 'zipframes.events.dlx';
export const DLQ_QUEUE = 'zipframes.events.dlq';
/** The broker's nameless direct exchange, which routes by queue name. */
export const DEFAULT_EXCHANGE = '';

export const NOTIFICATION_ROUTING_KEYS = [
  'user.registered',
  'user.updated',
  'user.deleted',
  'video.processed',
  'video.failed',
] as const;

export const createNotificationAmqpTopology = (): Topology => ({
  exchanges: [
    { name: EVENT_EXCHANGE, type: 'topic', durable: true },
    { name: DLX_EXCHANGE, type: 'topic', durable: true },
  ],
  queues: [
    { name: DLQ_QUEUE, durable: true },
    {
      name: NOTIFICATION_QUEUE,
      durable: true,
      deadLetterExchange: DLX_EXCHANGE,
      deadLetterRoutingKey: NOTIFICATION_QUEUE,
    },
    {
      name: NOTIFICATION_RETRY_QUEUE,
      durable: true,
      deadLetterExchange: DEFAULT_EXCHANGE,
      deadLetterRoutingKey: NOTIFICATION_QUEUE,
    },
  ],
  bindings: [
    { queue: DLQ_QUEUE, exchange: DLX_EXCHANGE, routingKey: '#' },
    ...NOTIFICATION_ROUTING_KEYS.map((routingKey) => ({
      queue: NOTIFICATION_QUEUE,
      exchange: EVENT_EXCHANGE,
      routingKey,
    })),
  ],
});
