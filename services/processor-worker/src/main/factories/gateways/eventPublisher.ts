import { createPublisher } from '@zipframes/communication';

import { AmqpEventPublisher } from '../../../infrastructure/gateways/amqpEventPublisher.gateway.js';
import type { Amqplib } from '../externals/amqplib.js';

export const createEventPublisher = (amqp: Amqplib): AmqpEventPublisher =>
  new AmqpEventPublisher(createPublisher(amqp));
