import type { User } from '../entities/user.js';

/** The event the Identity context publishes when a user is created. */
export interface UserRegistered {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
}

export const userRegisteredFrom = (user: User): UserRegistered => ({
  userId: user.id,
  name: user.name,
  email: user.email,
});
