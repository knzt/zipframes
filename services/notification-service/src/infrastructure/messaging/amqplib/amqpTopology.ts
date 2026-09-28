/**
 * AMQP topology declaration for the notification-service.
 *
 * Two jobs, two queues: contacts project identity; emails send the
 * client-facing mail. Retry of one must not land on the other, and
 * neither retry may go back through `zipframes.events` or every other
 * subscriber of `video.failed` / identity events would see it again.
 * Each wait queue uses TTL + DLX to return an expired retry to its own
 * main queue through the default exchange. Both main queues dead-letter
 * to the shared DLQ. Assertion lives on the connection
 * (`assertTopology`); this file only declares what to assert. It is not
 * a layer.
 */
import type { QueueDefinition, Topology } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

export { EVENT_EXCHANGE };

export const CONTACTS_QUEUE = 'notification-service.contacts';
export const CONTACTS_RETRY_QUEUE = 'notification-service.contacts.retry';
export const EMAILS_QUEUE = 'notification-service.emails';
export const EMAILS_RETRY_QUEUE = 'notification-service.emails.retry';
export const DLX_EXCHANGE = 'zipframes.events.dlx';
export const DLQ_QUEUE = 'zipframes.events.dlq';
/** The broker's nameless direct exchange, which routes by queue name. */
export const DEFAULT_EXCHANGE = '';

export const CONTACT_ROUTING_KEYS = ['user.registered', 'user.updated', 'user.deleted'] as const;
export const EMAIL_ROUTING_KEYS = ['video.processed', 'video.failed'] as const;

const serviceQueue = (name: string, retryName: string): QueueDefinition[] => [
  {
    name,
    durable: true,
    deadLetterExchange: DLX_EXCHANGE,
    deadLetterRoutingKey: name,
  },
  {
    name: retryName,
    durable: true,
    deadLetterExchange: DEFAULT_EXCHANGE,
    deadLetterRoutingKey: name,
  },
];

export const createNotificationAmqpTopology = (): Topology => ({
  exchanges: [
    { name: EVENT_EXCHANGE, type: 'topic', durable: true },
    { name: DLX_EXCHANGE, type: 'topic', durable: true },
  ],
  queues: [
    { name: DLQ_QUEUE, durable: true },
    ...serviceQueue(CONTACTS_QUEUE, CONTACTS_RETRY_QUEUE),
    ...serviceQueue(EMAILS_QUEUE, EMAILS_RETRY_QUEUE),
  ],
  bindings: [
    { queue: DLQ_QUEUE, exchange: DLX_EXCHANGE, routingKey: '#' },
    ...CONTACT_ROUTING_KEYS.map((routingKey) => ({
      queue: CONTACTS_QUEUE,
      exchange: EVENT_EXCHANGE,
      routingKey,
    })),
    ...EMAIL_ROUTING_KEYS.map((routingKey) => ({
      queue: EMAILS_QUEUE,
      exchange: EVENT_EXCHANGE,
      routingKey,
    })),
  ],
});
