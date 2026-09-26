import { createPublisher } from '@zipframes/communication';

import type { Clock } from '../../../application/interfaces/services/Clock.js';
import type { IdGenerator } from '../../../application/interfaces/services/IdGenerator.js';
import { AmqpEventPublisher } from '../../../infrastructure/gateways/amqpEventPublisher.gateway.js';
import type { RabbitMqConnection } from '../../../infrastructure/messaging/rabbitmqConnection.js';

export const createEventPublisher = (deps: {
  readonly connection: RabbitMqConnection;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}): AmqpEventPublisher =>
  new AmqpEventPublisher({
    publisher: createPublisher(deps.connection),
    createId: () => deps.idGenerator.next(),
    now: () => deps.clock.now(),
  });
