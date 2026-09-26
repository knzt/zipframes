import { createPublisher } from '@zipframes/communication';
import type { ConfirmChannel } from 'amqplib';

import type { Clock } from '../../../application/interfaces/services/Clock.js';
import type { IdGenerator } from '../../../application/interfaces/services/IdGenerator.js';
import { AmqpEventPublisher } from '../../../infrastructure/gateways/amqpEventPublisher.gateway.js';
import { createAmqpPublishPort } from '../../../infrastructure/messaging/amqpPublisher.js';

export const createEventPublisher = (deps: {
  readonly channel: ConfirmChannel;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}): AmqpEventPublisher =>
  new AmqpEventPublisher({
    publisher: createPublisher(createAmqpPublishPort(deps.channel)),
    createId: () => deps.idGenerator.next(),
    now: () => deps.clock.now(),
  });
