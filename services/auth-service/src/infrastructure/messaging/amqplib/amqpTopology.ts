/**
 * AMQP topology declaration for the identity process.
 *
 * This is the list of exchanges (auth only publishes; it has no queues)
 * that must exist on the broker before `user.registered` is published.
 * `start.ts` asserts it once after opening the confirm channel. It is
 * not a layer — just the broker catalog next to the connection.
 */
import type { Topology } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';
import type { ConfirmChannel } from 'amqplib';

export { EVENT_EXCHANGE };

export const createIdentityAmqpTopology = (): Topology => ({
  exchanges: [{ name: EVENT_EXCHANGE, type: 'topic', durable: true }],
  queues: [],
  bindings: [],
});

export const assertAmqpTopology = async (
  channel: ConfirmChannel,
  topology: Topology = createIdentityAmqpTopology(),
): Promise<void> => {
  for (const exchange of topology.exchanges) {
    await channel.assertExchange(exchange.name, exchange.type, {
      durable: exchange.durable ?? true,
    });
  }
};
