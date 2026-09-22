import bcrypt from "bcryptjs";

import { asPasswordHash } from "../../domain/password.js";
import type { Password, PasswordHash } from "../../domain/password.js";
import type { PasswordHasher } from "../../application/ports/index.js";

const SALT_ROUNDS = 12;

export class BcryptPasswordHasher implements PasswordHasher {
  hash(password: Password): Promise<PasswordHash> {
    return bcrypt.hash(password, SALT_ROUNDS).then(asPasswordHash);
  }

  verify(password: string, hash: PasswordHash): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
