import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import type { EventOutbox } from '../../src/application/interfaces/gateways/EventOutbox.js';
import type {
  UserRepository,
  UserRepositoryEmailTakenError,
} from '../../src/application/interfaces/repositories/UserRepository.js';
import type { Clock } from '../../src/application/interfaces/services/Clock.js';
import type { IdGenerator } from '../../src/application/interfaces/services/IdGenerator.js';
import type { PasswordHasher } from '../../src/application/interfaces/services/PasswordHasher.js';
import type { TokenIssuer } from '../../src/application/interfaces/services/TokenIssuer.js';
import type { UnitOfWork } from '../../src/application/interfaces/services/UnitOfWork.js';
import type { UserRegistered } from '../../src/domain/events/userRegistered.js';
import type { User, UserId } from '../../src/domain/entities/user.js';
import type { PasswordHash } from '../../src/domain/valueObjects/password.js';

/**
 * In-memory stand-ins for the domain and use-case interfaces, so the use
 * cases can be tested without a database, a broker or bcrypt.
 */
export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, User>();

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(this.users.get(email) ?? null);
  }

  save(user: User): Promise<Result<void, UserRepositoryEmailTakenError>> {
    if (this.users.has(user.email)) {
      return Promise.resolve(err({ code: 'EMAIL_TAKEN' as const }));
    }
    this.users.set(user.email, user);
    return Promise.resolve(ok(undefined));
  }
}

export class InMemoryEventOutbox implements EventOutbox {
  readonly recorded: { readonly event: UserRegistered; readonly correlationId: string }[] = [];

  record(event: UserRegistered, correlationId: string): Promise<void> {
    this.recorded.push({ event, correlationId });
    return Promise.resolve();
  }
}

export class InMemoryUnitOfWork implements UnitOfWork {
  runCount = 0;

  run<T>(work: () => Promise<T>): Promise<T> {
    this.runCount += 1;
    return work();
  }
}

export class FakeHasher implements PasswordHasher {
  readonly verifiedAgainst: PasswordHash[] = [];

  hash(password: string): Promise<PasswordHash> {
    return Promise.resolve(`hashed:${password}` as PasswordHash);
  }

  verify(password: string, hash: PasswordHash): Promise<boolean> {
    this.verifiedAgainst.push(hash);
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
