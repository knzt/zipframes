import type { Result } from '@zipframes/core';

import type { User, UserRegistered } from './user.js';

export interface EmailTakenError {
  readonly code: 'EMAIL_TAKEN';
}

export interface UserRepository {
  findByEmail: (email: string) => Promise<User | null>;
  /**
   * Persists the user and the registration fact together, in one transaction.
   * A registration is never recorded without its user, and a user is never
   * stored without the fact that they registered.
   */
  save: (user: User, registered: UserRegistered) => Promise<Result<void, EmailTakenError>>;
}
