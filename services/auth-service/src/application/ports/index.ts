import type { Result } from '@zipframes/core';

import type { User, UserId } from '../../domain/user.js';
import type { Password, PasswordHash } from '../../domain/password.js';

export interface UserRepository {
  findByEmail: (email: string) => Promise<User | null>;
  /**
   * Persists the user and the outbox event in a single transaction.
   *
   * The two must commit together: publishing without the row means the
   * notification context knows about a user the database does not, and
   * the reverse means an event that is never published (ADR-0008).
   */
  saveWithEvent: (user: User, event: OutboxEvent) => Promise<Result<void, EmailTakenError>>;
}

export interface EmailTakenError {
  readonly code: 'EMAIL_TAKEN';
}

export interface OutboxEvent {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly version: number;
  readonly payload: Record<string, unknown>;
  readonly correlationId: string | undefined;
  readonly occurredAt: Date;
}

export interface PasswordHasher {
  hash: (password: Password) => Promise<PasswordHash>;
  /** Compares in constant time; false for a wrong password, never throws. */
  verify: (password: string, hash: PasswordHash) => Promise<boolean>;
}

export interface TokenIssuer {
  /** Signs an access token for the user, returning it and its lifetime. */
  issue: (userId: UserId) => Promise<{ token: string; expiresInSeconds: number }>;
}

export interface IdGenerator {
  next: () => string;
}

export interface Clock {
  now: () => Date;
}
