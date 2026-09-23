import type { Password, PasswordHash } from './password.js';

export interface PasswordHasher {
  hash: (password: Password) => Promise<PasswordHash>;
  /**
   * Compares in constant time. A null hash still runs a comparison, so a
   * missing user is not faster than a wrong password. False means the
   * password did not match; this never throws.
   */
  verify: (password: string, hash: PasswordHash | null) => Promise<boolean>;
}
