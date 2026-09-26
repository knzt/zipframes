import { createPublisher } from '@zipframes/communication';

import { AmqpEventPublisher } from '../../../infrastructure/gateways/amqpEventPublisher.gateway.js';
import type { RabbitMqConnection } from '../../../infrastructure/messaging/rabbitmqConnection.js';

export const createEventPublisher = (connection: RabbitMqConnection): AmqpEventPublisher =>
  new AmqpEventPublisher(createPublisher(connection));
