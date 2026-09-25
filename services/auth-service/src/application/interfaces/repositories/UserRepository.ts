import type { Result } from '@zipframes/core';

import type { User } from '../../../domain/entities/user.js';

export interface UserRepositoryEmailTakenError {
  readonly code: 'EMAIL_TAKEN';
}

export interface UserRepository {
  findByEmail: (email: string) => Promise<User | null>;
  save: (user: User) => Promise<Result<void, UserRepositoryEmailTakenError>>;
}
