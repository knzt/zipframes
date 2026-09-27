import { randomUUID } from 'node:crypto';

import { err, ok, ValidationError } from '@zipframes/core';
import type { Brand, Result } from '@zipframes/core';
import { Email, Name } from '@zipframes/value-objects';

import { asPasswordHash } from '../valueObjects/password.js';
import type { PasswordHash } from '../valueObjects/password.js';

export type UserId = Brand<string, 'UserId'>;

/**
 * Compile-time brand only. Does not parse or validate the string; a
 * persisted or freshly generated UUID is already a user id.
 */
export const brandUserId = (id: string): UserId => id as UserId;

export interface RegisterUserProps {
  readonly id?: string;
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
 * Identity user. {@link User.create} validates name and email and owns the
 * id. The password hash is attached once with {@link User.attachPasswordHash}
 * after uniqueness is confirmed. Stored rows come back through
 * {@link User.fromPersistence}, which already includes the hash.
 */
export class User {
  private constructor(private readonly state: UserState) {}

  /**
   * Validates name and email. Generates {@link randomUUID} when `id` is
   * omitted. The hash is not set here: hashing is infrastructure and must
   * not run before validation and the uniqueness check.
   */
  static create(props: RegisterUserProps): Result<User, ValidationError> {
    const name = Name.create(props.name);
    if (!name.ok) {
      return err(new ValidationError('INVALID_NAME', name.error.message));
    }

    const email = Email.create(props.email);
    if (!email.ok) {
      return err(new ValidationError('INVALID_EMAIL', email.error.message));
    }

    return ok(
      new User({
        id: brandUserId(props.id ?? randomUUID()),
        name: name.value,
        email: email.value,
        passwordHash: asPasswordHash(''),
        createdAt: props.now,
        updatedAt: props.now,
      }),
    );
  }

  /** Rehydrates a user that was already validated, hashed, and stored. */
  static fromPersistence(data: PersistedUser): User {
    return new User({
      id: brandUserId(data.id),
      name: data.name,
      email: data.email,
      passwordHash: asPasswordHash(data.passwordHash),
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }

  /**
   * The one way to put a bcrypt hash on a newly created user, after the
   * hasher has run. Stored users already have a hash via
   * {@link User.fromPersistence}.
   */
  attachPasswordHash(passwordHash: string): User {
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
