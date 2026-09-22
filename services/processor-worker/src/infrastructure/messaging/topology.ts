import type { Topology } from '@zipframes/communication';

export const UPLOADED_QUEUE = 'processor.video.uploaded';
export const UPLOADED_RETRY_QUEUE = 'processor.video.uploaded.wait';
export const EVENT_EXCHANGE = 'zipframes.events';
export const DLX_EXCHANGE = 'zipframes.events.dlx';
export const DLQ_QUEUE = 'zipframes.events.dlq';

/**
 * Worker topology: main queue (DLX → DLQ) plus a wait queue whose expired
 * messages return to the main queue via the events exchange (TTL retry).
 */
export const createProcessorTopology = (): Topology => ({
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
