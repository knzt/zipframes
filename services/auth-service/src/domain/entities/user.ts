import { err, ok } from '@zipframes/core';
import type { Brand, Result } from '@zipframes/core';
import { Email, Name } from '@zipframes/value-objects';

import type { UserError } from '../errors/userErrors.js';
import { asPasswordHash } from '../valueObjects/password.js';
import type { PasswordHash } from '../valueObjects/password.js';

export type UserId = Brand<string, 'UserId'>;

export const asUserId = (id: string): UserId => id as UserId;

export interface User {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: PasswordHash;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RegisterUserInput {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly now: Date;
}

/**
 * Builds a user from already-hashed credentials.
 *
 * The plaintext password never reaches this function: hashing happens in
 * the use case, through PasswordHasher, because it is infrastructure. What the
 * entity guarantees is that a user always has a valid name and a valid,
 * normalized email.
 */
export const registerUser = (input: RegisterUserInput): Result<User, UserError> => {
  const name = Name.create(input.name);
  if (!name.ok) {
    return err({ code: 'INVALID_NAME' as const, message: name.error.message });
  }

  const email = Email.create(input.email);
  if (!email.ok) {
    return err({ code: 'INVALID_EMAIL' as const, message: email.error.message });
  }

  return ok({
    id: asUserId(input.id),
    name: name.value,
    email: email.value,
    passwordHash: asPasswordHash(input.passwordHash),
    createdAt: input.now,
    updatedAt: input.now,
  });
};
