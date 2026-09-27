/**
 * AMQP topology declaration for the processor worker.
 *
 * This is the list of exchanges, queues, and bindings this process
 * asserts at boot so consume/publish do not race an undeclared broker
 * object. The wait queue uses TTL + DLX to return expired retries to
 * `video.uploaded`. The main queue dead-letters to the shared DLQ.
 * Assertion itself lives on the connection (`assertTopology`); this
 * file only declares what to assert. It is not a layer.
 */
import type { Topology } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

export { EVENT_EXCHANGE };

export const UPLOADED_QUEUE = 'processor.video.uploaded';
export const UPLOADED_RETRY_QUEUE = 'processor.video.uploaded.wait';
export const DLX_EXCHANGE = 'zipframes.events.dlx';
export const DLQ_QUEUE = 'zipframes.events.dlq';

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
      // Expired messages are republished to the events exchange as video.uploaded.
      deadLetterExchange: EVENT_EXCHANGE,
      deadLetterRoutingKey: 'video.uploaded',
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
