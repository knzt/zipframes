import type { Password, PasswordHash } from '../../../domain/valueObjects/password.js';

export interface PasswordHasher {
  hash: (password: Password) => Promise<PasswordHash>;
  /** False means the password did not match. This never throws. */
  verify: (password: string, hash: PasswordHash) => Promise<boolean>;
}
