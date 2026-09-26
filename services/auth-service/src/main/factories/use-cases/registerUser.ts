import type { PrismaClient } from '@prisma/client';
import type { Logger } from '@zipframes/logger';

import type { EventPublisher } from '../../../application/interfaces/gateways/EventPublisher.js';
import {
  RegisterUserUseCase,
  type RegisterUserUseCaseDeps,
} from '../../../application/useCases/registerUser/RegisterUserUseCase.js';
import type { AmqpConnection } from '../../../infrastructure/messaging/amqpConnection.js';
import { createEventPublisher } from '../gateways/eventPublisher.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createPasswordHasher } from '../services/passwordHasher.js';

export interface RegisterUserExternals {
  readonly prisma: PrismaClient;
  readonly logger: Logger;
  readonly amqp?: AmqpConnection;
  readonly eventPublisher?: EventPublisher;
  readonly onPublishFailed?: RegisterUserUseCaseDeps['onPublishFailed'];
}

const resolveEventPublisher = (externals: RegisterUserExternals): EventPublisher => {
  if (externals.eventPublisher !== undefined) {
    return externals.eventPublisher;
  }
  if (externals.amqp === undefined) {
    throw new Error('createRegisterUser requires amqp or eventPublisher');
  }
  return createEventPublisher(externals.amqp);
};

export const createRegisterUser = (externals: RegisterUserExternals): RegisterUserUseCase =>
  new RegisterUserUseCase({
    userRepository: createUserRepository(externals.prisma),
    passwordHasher: createPasswordHasher(),
    eventPublisher: resolveEventPublisher(externals),
    onPublishFailed:
      externals.onPublishFailed ??
      ((error, details) => {
        externals.logger.error('failed to publish user.registered', {
          err: error,
          userId: details.userId,
          correlationId: details.correlationId,
        });
      }),
  });
