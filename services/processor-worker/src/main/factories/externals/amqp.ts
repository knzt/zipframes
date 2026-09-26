import {
  createRabbitMqConnection,
  type RabbitMqConnection,
} from '../../../infrastructure/messaging/rabbitmqConnection.js';

export const createAmqp = (url: string): Promise<RabbitMqConnection> =>
  createRabbitMqConnection(url);
