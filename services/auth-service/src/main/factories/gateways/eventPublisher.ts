import { createPublisher } from '@zipframes/communication';

import { AmqpEventPublisher } from '../../../infrastructure/gateways/amqpEventPublisher.gateway.js';
import type { AmqpConnection } from '../../../infrastructure/messaging/amqpConnection.js';
import { createAmqpPublishPort } from '../../../infrastructure/messaging/amqpPublisher.js';

export const createEventPublisher = (amqp: AmqpConnection): AmqpEventPublisher =>
  new AmqpEventPublisher(createPublisher(createAmqpPublishPort(amqp.channel)));
