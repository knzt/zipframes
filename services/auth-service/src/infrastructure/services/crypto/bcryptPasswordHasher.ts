import bcrypt from 'bcryptjs';

import type { PasswordHasher } from '../../../application/interfaces/services/PasswordHasher.js';
import { asPasswordHash } from '../../../domain/valueObjects/password.js';
import type { Password, PasswordHash } from '../../../domain/valueObjects/password.js';

const SALT_ROUNDS = 12;

export class BcryptPasswordHasher implements PasswordHasher {
  hash(password: Password): Promise<PasswordHash> {
    return bcrypt.hash(password, SALT_ROUNDS).then(asPasswordHash);
  }

  verify(password: string, hash: PasswordHash): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
