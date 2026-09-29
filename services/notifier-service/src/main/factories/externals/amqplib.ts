import {
  createAmqpPing,
  createRabbitMqConnection,
} from '../../../infrastructure/messaging/amqplib/connection.js';

export const createAmqplib = (
  url: string,
  prefetch: number,
): ReturnType<typeof createRabbitMqConnection> => createRabbitMqConnection(url, prefetch);

export type Amqplib = Awaited<ReturnType<typeof createAmqplib>>;

export { createAmqpPing };
