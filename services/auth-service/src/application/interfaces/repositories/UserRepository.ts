import type { User } from '../../../domain/entities/user.js';

export interface UserRepository {
  findByEmail: (email: string) => Promise<User | null>;
  create: (user: User) => Promise<User>;
  /** No-op if the id is already gone, so a retried deletion is harmless. */
  deleteById: (userId: string) => Promise<void>;
}
