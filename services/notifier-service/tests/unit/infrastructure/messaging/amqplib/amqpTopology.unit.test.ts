import { describe, expect, it } from 'vitest';

import {
  CONTACTS_QUEUE,
  CONTACTS_RETRY_QUEUE,
  CONTACT_ROUTING_KEYS,
  createNotifierAmqpTopology,
  DEFAULT_EXCHANGE,
  DLQ_QUEUE,
  DLX_EXCHANGE,
  EMAILS_QUEUE,
  EMAILS_RETRY_QUEUE,
  EMAIL_ROUTING_KEYS,
  EVENT_EXCHANGE,
} from '../../../../../src/infrastructure/messaging/amqplib/amqpTopology.js';

describe('createNotifierAmqpTopology', () => {
  it('binds identity events to contacts and video outcomes to emails', () => {
    const topology = createNotifierAmqpTopology();

    expect(topology.bindings).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    expect(topology.bindings).not.toEqual(
      expect.arrayContaining([
        { queue: CONTACTS_QUEUE, exchange: EVENT_EXCHANGE, routingKey: 'video.processed' },
        { queue: EMAILS_QUEUE, exchange: EVENT_EXCHANGE, routingKey: 'user.registered' },
      ]),
    );
  });

  it('returns expired retries to the same job queue, not the events exchange', () => {
    const topology = createNotifierAmqpTopology();
    const contactsRetry = topology.queues.find((queue) => queue.name === CONTACTS_RETRY_QUEUE);
    const emailsRetry = topology.queues.find((queue) => queue.name === EMAILS_RETRY_QUEUE);
    const contacts = topology.queues.find((queue) => queue.name === CONTACTS_QUEUE);
    const emails = topology.queues.find((queue) => queue.name === EMAILS_QUEUE);

    expect(contactsRetry?.deadLetterExchange).toBe(DEFAULT_EXCHANGE);
    expect(contactsRetry?.deadLetterRoutingKey).toBe(CONTACTS_QUEUE);
    expect(emailsRetry?.deadLetterExchange).toBe(DEFAULT_EXCHANGE);
    expect(emailsRetry?.deadLetterRoutingKey).toBe(EMAILS_QUEUE);
    expect(contacts?.deadLetterExchange).toBe(DLX_EXCHANGE);
    expect(emails?.deadLetterExchange).toBe(DLX_EXCHANGE);
    expect(contactsRetry?.deadLetterExchange).not.toBe(EVENT_EXCHANGE);
    expect(emailsRetry?.deadLetterExchange).not.toBe(EVENT_EXCHANGE);
  });
});
