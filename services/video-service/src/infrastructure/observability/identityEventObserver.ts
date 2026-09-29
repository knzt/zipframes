import type { MessageOutcome, MessageOutcomeContext } from '@zipframes/communication';
import { isBaseError } from '@zipframes/core';
import type { Logger } from '@zipframes/logger';
import type { UserDeletedEvent } from '@zipframes/schemas/auth-service';

export type IdentityEventOutcome = MessageOutcome<UserDeletedEvent, void>;

const errorCodeOf = (error: unknown): string => (isBaseError(error) ? error.code : 'UNEXPECTED');

/** Logs each settled `user.deleted` message. Carries the owner id only. */
export const createIdentityEventObserver =
  (deps: { readonly logger: Logger }) =>
  (outcome: IdentityEventOutcome, { attempt }: MessageOutcomeContext): void => {
    if (outcome.kind === 'poison') {
      deps.logger.warn('poison user.deleted message', { attempt, issues: outcome.error });
      return;
    }

    const message = { userId: outcome.event.payload.userId, attempt };

    switch (outcome.kind) {
      case 'handled':
        deps.logger.info('account videos deleted', message);
        return;
      case 'retry':
        deps.logger.warn('account video deletion failed; scheduling retry', {
          ...message,
          errorCode: errorCodeOf(outcome.error),
        });
        return;
      case 'exhausted':
        deps.logger.error('account video deletion exhausted retries', {
          ...message,
          errorCode: errorCodeOf(outcome.error),
        });
    }
  };
