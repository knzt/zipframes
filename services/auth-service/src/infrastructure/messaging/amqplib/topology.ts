import type { Topology } from '@zipframes/communication';
import { EVENT_EXCHANGE } from '@zipframes/schemas/shared';
import type { ConfirmChannel } from 'amqplib';

export { EVENT_EXCHANGE };

export const createIdentityTopology = (): Topology => ({
  exchanges: [{ name: EVENT_EXCHANGE, type: 'topic', durable: true }],
  queues: [],
  bindings: [],
});

export const assertTopology = async (
  channel: ConfirmChannel,
  topology: Topology = createIdentityTopology(),
): Promise<void> => {
  for (const exchange of topology.exchanges) {
    await channel.assertExchange(exchange.name, exchange.type, {
      durable: exchange.durable ?? true,
    });
  }
};
