import type { User } from '../../../domain/entities/user.js';

export interface UserRepository {
  findByEmail: (email: string) => Promise<User | null>;
  create: (user: User) => Promise<void>;
}
