/**
 * AMQP topology declaration for the video-service.
 *
 * The service publishes `video.uploaded` on the events exchange and consumes
 * the worker's three status events from one queue. A retry waits in a TTL
 * queue that dead-letters straight back to that queue through the default
 * exchange: republishing on `zipframes.events` would hand `video.failed`
 * to every other subscriber (notification-service) once per retry.
 * It is not a layer, just the broker catalog next to the connection.
 */
import type { Topology } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';

export { EVENT_EXCHANGE };

export const PROCESSING_STATUS_QUEUE = 'video-service.processing-status';
export const PROCESSING_STATUS_RETRY_QUEUE = 'video-service.processing-status.retry';
export const DLX_EXCHANGE = 'zipframes.events.dlx';
export const DLQ_QUEUE = 'zipframes.events.dlq';
/** The broker's nameless direct exchange, which routes by queue name. */
export const DEFAULT_EXCHANGE = '';

export const PROCESSING_STATUS_ROUTING_KEYS = [
  'video.processing.started',
  'video.processed',
  'video.failed',
] as const;

export const createVideoServiceAmqpTopology = (): Topology => ({
  exchanges: [
    { name: EVENT_EXCHANGE, type: 'topic', durable: true },
    { name: DLX_EXCHANGE, type: 'topic', durable: true },
  ],
  queues: [
    { name: DLQ_QUEUE, durable: true },
    {
      name: PROCESSING_STATUS_QUEUE,
      durable: true,
      deadLetterExchange: DLX_EXCHANGE,
      deadLetterRoutingKey: PROCESSING_STATUS_QUEUE,
    },
    {
      name: PROCESSING_STATUS_RETRY_QUEUE,
      durable: true,
      deadLetterExchange: DEFAULT_EXCHANGE,
      deadLetterRoutingKey: PROCESSING_STATUS_QUEUE,
    },
  ],
  bindings: [
    { queue: DLQ_QUEUE, exchange: DLX_EXCHANGE, routingKey: '#' },
    ...PROCESSING_STATUS_ROUTING_KEYS.map((routingKey) => ({
      queue: PROCESSING_STATUS_QUEUE,
      exchange: EVENT_EXCHANGE,
      routingKey,
    })),
  ],
});
