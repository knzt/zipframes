import {
  connectAmqp,
  createAmqpPing,
} from '../../../infrastructure/messaging/amqplib/connection.js';

export const createAmqplib = (url: string): ReturnType<typeof connectAmqp> => connectAmqp(url);

export type Amqplib = Awaited<ReturnType<typeof createAmqplib>>;

export { createAmqpPing };
