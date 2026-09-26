import {
  connectAmqp,
  type AmqpConnection,
} from '../../../infrastructure/messaging/amqpConnection.js';

export const createAmqp = (url: string): Promise<AmqpConnection> => connectAmqp(url);
