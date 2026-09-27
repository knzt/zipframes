import type { Logger } from '@zipframes/logger';

import {
  RegisterUserUseCase,
  type RegisterUserUseCaseDeps,
} from '../../../application/useCases/registerUser/RegisterUserUseCase.js';
import type { Amqplib } from '../externals/amqplib.js';
import type { Prisma } from '../externals/prisma.js';
import { createEventPublisher } from '../gateways/eventPublisher.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createPasswordHasher } from '../services/passwordHasher.js';

export interface RegisterUserExternals {
  readonly prisma: Prisma;
  readonly amqp: Amqplib;
  readonly logger: Logger;
  readonly onPublishFailed?: RegisterUserUseCaseDeps['onPublishFailed'];
}

export const createRegisterUser = (externals: RegisterUserExternals): RegisterUserUseCase =>
  new RegisterUserUseCase({
    userRepository: createUserRepository(externals.prisma),
    passwordHasher: createPasswordHasher(),
    eventPublisher: createEventPublisher(externals.amqp),
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
