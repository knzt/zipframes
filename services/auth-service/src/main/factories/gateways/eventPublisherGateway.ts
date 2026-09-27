import { createPublisher } from '@zipframes/communication';

import {
  AmqpEventPublisherGateway,
  createAmqpPublishPort,
} from '../../../infrastructure/gateways/amqpEventPublisherGateway.js';
import type { Amqplib } from '../externals/amqplib.js';

export const createEventPublisherGateway = (amqp: Amqplib): AmqpEventPublisherGateway =>
  new AmqpEventPublisherGateway({
    publisher: createPublisher(createAmqpPublishPort(amqp.channel)),
  });
