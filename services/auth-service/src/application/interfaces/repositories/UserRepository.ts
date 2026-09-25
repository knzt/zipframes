import type { Result } from '@zipframes/core';

import type { User } from '../../../domain/entities/user.js';

export interface UserRepositoryEmailTakenError {
  readonly code: 'EMAIL_TAKEN';
}

/**
 * Thrown by the Prisma adapter when `users.email` collides inside an
 * interactive transaction. Returning `Result` there would try to commit an
 * already-aborted transaction; the use case maps this back to `EMAIL_TAKEN`.
 */
export class UserEmailTakenError extends Error implements UserRepositoryEmailTakenError {
  readonly code = 'EMAIL_TAKEN' as const;

  constructor() {
    super('email is already registered');
    this.name = 'UserEmailTakenError';
  }
}

export interface UserRepository {
  findByEmail: (email: string) => Promise<User | null>;
  save: (user: User) => Promise<Result<void, UserRepositoryEmailTakenError>>;
}
