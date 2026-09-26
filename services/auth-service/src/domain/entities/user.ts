import { err, ok, ValidationError } from '@zipframes/core';
import type { Brand, Result } from '@zipframes/core';
import { Email, Name } from '@zipframes/value-objects';

import { asPasswordHash } from '../valueObjects/password.js';
import type { PasswordHash } from '../valueObjects/password.js';

export type UserId = Brand<string, 'UserId'>;

export const asUserId = (id: string): UserId => id as UserId;

export interface RegisterUserInput {
  readonly id: string;
  readonly name: string;
  readonly email: string;
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

interface UserState {
  readonly id: UserId;
  readonly name: string;
  readonly email: string;
  readonly passwordHash: PasswordHash;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Identity user. Created with {@link User.create} when registering a new
 * identity, or rehydrated through {@link User.fromPersistence} after reading
 * from storage.
 */
export class User {
  private constructor(private readonly state: UserState) {}

  /**
   * Validates name and email. The password hash is attached later with
   * {@link User.withPasswordHash}, after uniqueness is confirmed, because
   * hashing is infrastructure and must not run before validation.
   */
  static create(input: RegisterUserInput): Result<User, ValidationError> {
    const name = Name.create(input.name);
    if (!name.ok) {
      return err(new ValidationError('INVALID_NAME', name.error.message));
    }

    const email = Email.create(input.email);
    if (!email.ok) {
      return err(new ValidationError('INVALID_EMAIL', email.error.message));
    }

    return ok(
      new User({
        id: asUserId(input.id),
        name: name.value,
        email: email.value,
        passwordHash: asPasswordHash(''),
        createdAt: input.now,
        updatedAt: input.now,
      }),
    );
  }

  /** Rehydrates a user that was already validated and stored. */
  static fromPersistence(data: PersistedUser): User {
    return new User({
      id: asUserId(data.id),
      name: data.name,
      email: data.email,
      passwordHash: asPasswordHash(data.passwordHash),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  withPasswordHash(passwordHash: string): User {
    return new User({
      ...this.state,
      passwordHash: asPasswordHash(passwordHash),
    });
  }

  get id(): UserId {
    return this.state.id;
  }

  get name(): string {
    return this.state.name;
  }

  get email(): string {
    return this.state.email;
  }

  get passwordHash(): PasswordHash {
    return this.state.passwordHash;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  toJSON(): PersistedUser {
    return {
      id: this.state.id,
      name: this.state.name,
      email: this.state.email,
      passwordHash: this.state.passwordHash,
      createdAt: this.state.createdAt,
      updatedAt: this.state.updatedAt,
    };
  }
}
