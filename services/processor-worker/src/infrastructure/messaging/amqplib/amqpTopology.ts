/**
 * AMQP topology declaration for the processor worker.
 *
 * This is the list of exchanges, queues, and bindings this process
 * asserts at boot so consume/publish do not race an undeclared broker
 * object. The retry queue uses TTL + DLX to return an expired retry
 * straight to the main queue through the default exchange: sending it
 * back through `zipframes.events` would hand every retry to any other
 * subscriber of `video.uploaded` too. The main queue dead-letters to the
 * shared DLQ. Assertion itself lives on the connection
 * (`assertTopology`); this file only declares what to assert. It is not
 * a layer.
 */
import type { Topology } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

export { EVENT_EXCHANGE };

export const UPLOADED_QUEUE = 'processor.video.uploaded';
/**
 * Replaces `processor.video.uploaded.wait`, which dead-lettered into the
 * events exchange. A new name, because a broker refuses to redeclare an
 * existing queue with different arguments.
 */
export const UPLOADED_RETRY_QUEUE = 'processor.video.uploaded.retry';
export const DLX_EXCHANGE = 'zipframes.events.dlx';
export const DLQ_QUEUE = 'zipframes.events.dlq';
/** The broker's nameless direct exchange, which routes by queue name. */
export const DEFAULT_EXCHANGE = '';

export const createProcessorAmqpTopology = (): Topology => ({
  exchanges: [
    { name: EVENT_EXCHANGE, type: 'topic', durable: true },
    { name: DLX_EXCHANGE, type: 'topic', durable: true },
  ],
  queues: [
    {
      name: DLQ_QUEUE,
      durable: true,
    },
    {
      name: UPLOADED_QUEUE,
      durable: true,
      deadLetterExchange: DLX_EXCHANGE,
      deadLetterRoutingKey: UPLOADED_QUEUE,
    },
    {
      name: UPLOADED_RETRY_QUEUE,
      durable: true,
      deadLetterExchange: DEFAULT_EXCHANGE,
      deadLetterRoutingKey: UPLOADED_QUEUE,
    },
  ],
  bindings: [
    { queue: DLQ_QUEUE, exchange: DLX_EXCHANGE, routingKey: '#' },
    {
      queue: UPLOADED_QUEUE,
      exchange: EVENT_EXCHANGE,
      routingKey: 'video.uploaded',
    },
  ],
});
