import amqp from 'amqplib';
import type { ChannelModel, ConfirmChannel } from 'amqplib';

// Unverified against a live broker in this environment (no Docker/network
// access to RabbitMQ here). Written against amqplib's documented API;
// needs an integration test against the real broker (infra/docker-compose)
// before it can be trusted, per docs/architecture/layers.md's testing
// strategy for adapters touching real infrastructure.

export type AmqpConnection = {
  readonly channel: ConfirmChannel;
  readonly close: () => Promise<void>;
};

export const connectAmqp = async (url: string): Promise<AmqpConnection> => {
  const connection: ChannelModel = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();

  return {
    channel,
    close: async () => {
      await channel.close();
      await connection.close();
    },
  };
};
