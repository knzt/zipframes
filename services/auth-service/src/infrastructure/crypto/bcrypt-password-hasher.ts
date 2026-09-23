import bcrypt from 'bcryptjs';

import { asPasswordHash } from '../../domain/password.js';
import type { Password, PasswordHash } from '../../domain/password.js';
import type { PasswordHasher } from '../../domain/password-hasher.js';

const SALT_ROUNDS = 12;

export class BcryptPasswordHasher implements PasswordHasher {
  private dummyHash: string | undefined;

  hash(password: Password): Promise<PasswordHash> {
    return bcrypt.hash(password, SALT_ROUNDS).then(asPasswordHash);
  }

  async verify(password: string, hash: PasswordHash | null): Promise<boolean> {
    const comparable = hash ?? (await this.dummy());
    return bcrypt.compare(password, comparable);
  }

  /**
   * A real cost-12 hash, created once per process. Comparing against it
   * takes about as long as comparing against a stored user hash.
   */
  private async dummy(): Promise<string> {
    if (this.dummyHash !== undefined) {
      return this.dummyHash;
    }
    const hash = await bcrypt.hash('timing-equalization', SALT_ROUNDS);
    this.dummyHash = hash;
    return hash;
  }
}
