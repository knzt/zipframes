import type { Logger } from '@zipframes/logger';

import { DeleteAccountUseCase } from '../../../application/useCases/deleteAccount/DeleteAccountUseCase.js';
import type { Amqplib } from '../externals/amqplib.js';
import type { Prisma } from '../externals/prisma.js';
import { createEventPublisherGateway } from '../gateways/eventPublisherGateway.js';
import { createUserRepository } from '../repositories/userRepository.js';

/** Clients opened once in `start.ts` and reused for this use case. */
export interface DeleteAccountExternalDeps {
  readonly prisma: Prisma;
  readonly amqp: Amqplib;
  readonly logger: Logger;
  readonly onPublishFailed?: (
    error: unknown,
    details: { readonly userId: string; readonly correlationId: string },
  ) => void;
}

export const createDeleteAccountUseCase = (
  externalDeps: DeleteAccountExternalDeps,
): DeleteAccountUseCase =>
  new DeleteAccountUseCase(
    createUserRepository(externalDeps.prisma),
    createEventPublisherGateway(externalDeps.amqp),
    externalDeps.onPublishFailed ??
      ((error, details) => {
        externalDeps.logger.error('failed to publish user.deleted', {
          err: error,
          userId: details.userId,
          correlationId: details.correlationId,
        });
      }),
  );
