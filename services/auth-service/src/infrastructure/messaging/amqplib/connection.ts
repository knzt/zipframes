import type { Pingable } from '@zipframes/core';
import type { ConfirmChannel } from 'amqplib';
import amqp from 'amqplib';
import type { ChannelModel } from 'amqplib';

export interface AmqpConnection {
  readonly channel: ConfirmChannel;
  readonly isConnected: () => boolean;
  readonly close: () => Promise<void>;
}

export const createAmqpPing = (connection: Pick<AmqpConnection, 'isConnected'>): Pingable => ({
  ping: () => {
    if (!connection.isConnected()) {
      return Promise.reject(new Error('amqp disconnected'));
    }
    return Promise.resolve();
  },
});

export const connectAmqp = async (url: string): Promise<AmqpConnection> => {
  const connection: ChannelModel = await amqp.connect(url);
  const channel = await connection.createConfirmChannel();
  let open = true;

  connection.on('error', () => {
    open = false;
  });
  connection.on('close', () => {
    open = false;
  });

  return {
    channel,
    isConnected: () => open,
    close: async () => {
      // After the broker dropped us there is nothing left to close.
      if (!open) {
        return;
      }
      await channel.close();
      await connection.close();
    },
  };
};
