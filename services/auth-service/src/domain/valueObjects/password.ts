import { err, ok } from '@zipframes/core';
import type { Brand, Result } from '@zipframes/core';

import type { PasswordError } from '../errors/userErrors.js';

/**
 * A plaintext password that satisfies this context's policy.
 *
 * The policy lives here, not in @zipframes/value-objects: "a valid
 * password" is not a universal shape the way an email or a CPF is — it is
 * a rule the Identity context chose and can change on its own.
 */
export type Password = Brand<string, 'Password'>;

const MIN_LENGTH = 8;
// bcrypt silently truncates anything past 72 bytes, so accepting longer
// passwords would mean telling users characters count when they do not.
const MAX_LENGTH = 72;

export const createPassword = (raw: string): Result<Password, PasswordError> => {
  if (raw.length < MIN_LENGTH) {
    return err({
      code: 'TOO_SHORT' as const,
      message: `password must be at least ${String(MIN_LENGTH)} characters`,
    });
  }
  if (raw.length > MAX_LENGTH) {
    return err({
      code: 'TOO_LONG' as const,
      message: `password must be at most ${String(MAX_LENGTH)} characters`,
    });
  }
  if (!/\p{L}/u.test(raw)) {
    return err({
      code: 'NO_LETTER' as const,
      message: 'password must contain at least one letter',
    });
  }
  if (!/\d/u.test(raw)) {
    return err({ code: 'NO_DIGIT' as const, message: 'password must contain at least one digit' });
  }

  return ok(raw as Password);
};

/**
 * A bcrypt hash. Kept distinct from Password on purpose: the two must
 * never be mixed up, and only the hash is ever persisted.
 */
export type PasswordHash = Brand<string, 'PasswordHash'>;

export const asPasswordHash = (hash: string): PasswordHash => hash as PasswordHash;
