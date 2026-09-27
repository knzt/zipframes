import { createRabbitMqConnection } from '../../../infrastructure/messaging/amqplib/connection.js';

export const createAmqplib = (url: string): ReturnType<typeof createRabbitMqConnection> =>
  createRabbitMqConnection(url);

export type Amqplib = Awaited<ReturnType<typeof createAmqplib>>;
