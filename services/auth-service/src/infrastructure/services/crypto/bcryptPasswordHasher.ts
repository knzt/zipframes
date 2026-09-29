import bcrypt from 'bcryptjs';

import type { Password } from '@zipframes/value-objects';

import type { PasswordHasher } from '../../../application/interfaces/services/PasswordHasher.js';
import { asPasswordHash } from '../../../domain/valueObjects/passwordHash.js';
import type { PasswordHash } from '../../../domain/valueObjects/passwordHash.js';

const SALT_ROUNDS = 12;

export class BcryptPasswordHasher implements PasswordHasher {
  hash(password: Password): Promise<PasswordHash> {
    return bcrypt.hash(password, SALT_ROUNDS).then(asPasswordHash);
  }

  verify(password: string, hash: PasswordHash): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
