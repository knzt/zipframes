import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import type { PasswordHash } from '../../src/domain/password.js';
import type { User, UserId } from '../../src/domain/user.js';
import type {
  Clock,
  EmailTakenError,
  IdGenerator,
  OutboxEvent,
  PasswordHasher,
  TokenIssuer,
  UserRepository,
} from '../../src/application/ports/index.js';

/**
 * In-memory implementations of every port, so the use cases can be tested
 * without a database, a broker or bcrypt — which is the whole point of
 * depending on ports rather than on Prisma directly.
 */
export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, User>();
  readonly events: OutboxEvent[] = [];

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(this.users.get(email) ?? null);
  }

  saveWithEvent(user: User, event: OutboxEvent): Promise<Result<void, EmailTakenError>> {
    if (this.users.has(user.email)) {
      return Promise.resolve(err({ code: 'EMAIL_TAKEN' as const }));
    }
    this.users.set(user.email, user);
    this.events.push(event);
    return Promise.resolve(ok(undefined));
  }
}

export class FakeHasher implements PasswordHasher {
  hash(password: string): Promise<PasswordHash> {
    return Promise.resolve(`hashed:${password}` as PasswordHash);
  }

  verify(password: string, hash: PasswordHash): Promise<boolean> {
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
