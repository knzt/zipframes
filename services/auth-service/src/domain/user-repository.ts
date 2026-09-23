import type { Result } from '@zipframes/core';

import type { User, UserRegistered } from './user.js';

export interface EmailTakenError {
  readonly code: 'EMAIL_TAKEN';
}

export interface UserRepository {
  findByEmail: (email: string) => Promise<User | null>;
  /**
   * Persists the user and the registration fact together.
   *
   * The gateway writes the outbox row in the same transaction as the user.
   * Publishing without the row would tell the notification context about a
   * user the database does not have, and the reverse would leave an event
   * that is never published.
   */
  save: (
    user: User,
    registered: UserRegistered,
    correlationId: string,
  ) => Promise<Result<void, EmailTakenError>>;
}
