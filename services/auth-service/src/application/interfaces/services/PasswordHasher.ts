import type { Password } from '@zipframes/value-objects';

import type { PasswordHash } from '../../../domain/entities/user.js';

export interface PasswordHasher {
  hash: (password: Password) => Promise<PasswordHash>;
  /** False means the password did not match. This never throws. */
  verify: (password: string, hash: PasswordHash) => Promise<boolean>;
}
