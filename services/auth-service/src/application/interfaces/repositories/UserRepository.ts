import type { ConflictError, Result } from '@zipframes/core';

import type { User } from '../../../domain/entities/user.js';

export interface UserRepository {
  findByEmail: (email: string) => Promise<User | null>;
  save: (user: User) => Promise<Result<void, ConflictError>>;
}
