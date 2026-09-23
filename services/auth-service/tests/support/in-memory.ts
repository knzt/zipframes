import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import type { Clock } from '../../src/application/clock.js';
import type { IdGenerator } from '../../src/application/id-generator.js';
import type { TokenIssuer } from '../../src/application/token-issuer.js';
import type { PasswordHash } from '../../src/domain/password.js';
import type { PasswordHasher } from '../../src/domain/password-hasher.js';
import type { User, UserId, UserRegistered } from '../../src/domain/user.js';
import type { EmailTakenError, UserRepository } from '../../src/domain/user-repository.js';

export interface SavedRegistration {
  readonly registered: UserRegistered;
  readonly correlationId: string;
}

/**
 * In-memory stand-ins for the domain and use-case interfaces, so the use
 * cases can be tested without a database, a broker or bcrypt.
 */
export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, User>();
  readonly events: SavedRegistration[] = [];

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(this.users.get(email) ?? null);
  }

  save(
    user: User,
    registered: UserRegistered,
    correlationId: string,
  ): Promise<Result<void, EmailTakenError>> {
    if (this.users.has(user.email)) {
      return Promise.resolve(err({ code: 'EMAIL_TAKEN' as const }));
    }
    this.users.set(user.email, user);
    this.events.push({ registered, correlationId });
    return Promise.resolve(ok(undefined));
  }
}

export class FakeHasher implements PasswordHasher {
  readonly verifiedAgainst: (PasswordHash | null)[] = [];

  hash(password: string): Promise<PasswordHash> {
    return Promise.resolve(`hashed:${password}` as PasswordHash);
  }

  verify(password: string, hash: PasswordHash | null): Promise<boolean> {
    this.verifiedAgainst.push(hash);
    if (hash === null) {
      return Promise.resolve(false);
    }
    return Promise.resolve(`hashed:${password}` === hash);
  }
}

export class FakeTokenIssuer implements TokenIssuer {
  readonly issuedFor: UserId[] = [];

  issue(userId: UserId): Promise<{ token: string; expiresInSeconds: number }> {
    this.issuedFor.push(userId);
    return Promise.resolve({ token: `token-for-${userId}`, expiresInSeconds: 900 });
  }
}

export class SequentialIds implements IdGenerator {
  private counter = 0;

  next(): string {
    this.counter += 1;
    return `0194f3a0-0000-7000-8000-00000000000${String(this.counter)}`;
  }
}

export class FixedClock implements Clock {
  constructor(private readonly instant = new Date('2026-01-01T12:00:00.000Z')) {}

  now(): Date {
    return this.instant;
  }
}
