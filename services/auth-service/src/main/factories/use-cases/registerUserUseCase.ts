import type { Logger } from '@zipframes/logger';

import { RegisterUserUseCase } from '../../../application/useCases/registerUser/RegisterUserUseCase.js';
import type { Amqplib } from '../externals/amqplib.js';
import type { Prisma } from '../externals/prisma.js';
import { createEventPublisherGateway } from '../gateways/eventPublisherGateway.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createPasswordHasher } from '../services/passwordHasher.js';

/** Clients opened once in `start.ts` and reused for this use case. */
export interface RegisterUserExternalDeps {
  readonly prisma: Prisma;
  readonly amqp: Amqplib;
  readonly logger: Logger;
  readonly onPublishFailed?: (
    error: unknown,
    details: { readonly userId: string; readonly correlationId: string },
  ) => void;
}

export const createRegisterUserUseCase = (
  externalDeps: RegisterUserExternalDeps,
): RegisterUserUseCase =>
  new RegisterUserUseCase(
    createUserRepository(externalDeps.prisma),
    createPasswordHasher(),
    createEventPublisherGateway(externalDeps.amqp),
    externalDeps.onPublishFailed ??
      ((error, details) => {
        externalDeps.logger.error('failed to publish user.registered', {
          err: error,
          userId: details.userId,
          correlationId: details.correlationId,
        });
      }),
  );
