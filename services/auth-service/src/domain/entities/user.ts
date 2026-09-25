import { ValidationError } from '@zipframes/core';
import type { Brand } from '@zipframes/core';
import { Email, Name } from '@zipframes/value-objects';

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

const reconstitute = Symbol('reconstitute');

/**
 * Identity user. Created with {@link User} when registering a new identity, or
 * rehydrated through {@link User.fromPersistence} after reading from storage.
 */
export class User {
  private readonly _id: UserId;
  private readonly _name: string;
  private readonly _email: string;
  private readonly _passwordHash: PasswordHash;
  private readonly _createdAt: Date;
  private readonly _updatedAt: Date;

  /**
   * Builds a new user from already-hashed credentials.
   *
   * The plaintext password never reaches this constructor: hashing happens in
   * the use case, through PasswordHasher, because it is infrastructure.
   */
  constructor(input: RegisterUserInput);
  constructor(data: PersistedUser, mode: typeof reconstitute);
  constructor(input: RegisterUserInput | PersistedUser, mode?: typeof reconstitute) {
    if (mode === reconstitute) {
      const data = input as PersistedUser;
      this._id = asUserId(data.id);
      this._name = data.name;
      this._email = data.email;
      this._passwordHash = asPasswordHash(data.passwordHash);
      this._createdAt = data.createdAt;
      this._updatedAt = data.updatedAt;
      return;
    }

    const data = input as RegisterUserInput;
    const name = Name.create(data.name);
    if (!name.ok) {
      throw new ValidationError('INVALID_NAME', name.error.message);
    }

    const email = Email.create(data.email);
    if (!email.ok) {
      throw new ValidationError('INVALID_EMAIL', email.error.message);
    }

    this._id = asUserId(data.id);
    this._name = name.value;
    this._email = email.value;
    this._passwordHash = asPasswordHash(data.passwordHash);
    this._createdAt = data.now;
    this._updatedAt = data.now;
  }

  /** Rehydrates a user that was already validated and stored. */
  static fromPersistence(data: PersistedUser): User {
    return new User(data, reconstitute);
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
