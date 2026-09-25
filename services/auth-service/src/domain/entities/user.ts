import { err, ok } from '@zipframes/core';
import type { Brand, Result } from '@zipframes/core';
import { Email, Name } from '@zipframes/value-objects';

import type { UserError } from '../errors/userErrors.js';
import { asPasswordHash } from '../valueObjects/password.js';
import type { PasswordHash } from '../valueObjects/password.js';

export type UserId = Brand<string, 'UserId'>;

export const asUserId = (id: string): UserId => id as UserId;

export interface RegisterUserInput {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly now: Date;
}

export interface PersistedUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Identity user. Built through {@link User.register} before persistence or
 * {@link User.fromPersistence} after reading from storage.
 */
export class User {
  private constructor(
    private readonly _id: UserId,
    private readonly _name: string,
    private readonly _email: string,
    private readonly _passwordHash: PasswordHash,
    private readonly _createdAt: Date,
    private readonly _updatedAt: Date,
  ) {}

  /**
   * Builds a user from already-hashed credentials.
   *
   * The plaintext password never reaches this method: hashing happens in
   * the use case, through PasswordHasher, because it is infrastructure.
   */
  static register(input: RegisterUserInput): Result<User, UserError> {
    const name = Name.create(input.name);
    if (!name.ok) {
      return err({ code: 'INVALID_NAME' as const, message: name.error.message });
    }

    const email = Email.create(input.email);
    if (!email.ok) {
      return err({ code: 'INVALID_EMAIL' as const, message: email.error.message });
    }

    return ok(
      new User(
        asUserId(input.id),
        name.value,
        email.value,
        asPasswordHash(input.passwordHash),
        input.now,
        input.now,
      ),
    );
  }

  /** Rehydrates a user that was already validated and stored. */
  static fromPersistence(data: PersistedUser): User {
    return new User(
      asUserId(data.id),
      data.name,
      data.email,
      asPasswordHash(data.passwordHash),
      data.createdAt,
      data.updatedAt,
    );
  }

  get id(): UserId {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get email(): string {
    return this._email;
  }

  get passwordHash(): PasswordHash {
    return this._passwordHash;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  toJSON(): PersistedUser {
    return {
      id: this._id,
      name: this._name,
      email: this._email,
      passwordHash: this._passwordHash,
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
