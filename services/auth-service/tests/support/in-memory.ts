import type {
  EventPublisher,
  EventPublisherInput,
} from '../../src/application/interfaces/gateways/EventPublisher.js';
import type { UserRepository } from '../../src/application/interfaces/repositories/UserRepository.js';
import type { PasswordHasher } from '../../src/application/interfaces/services/PasswordHasher.js';
import type { TokenIssuer } from '../../src/application/interfaces/services/TokenIssuer.js';
import type { User, UserId } from '../../src/domain/entities/user.js';
import type { PasswordHash } from '../../src/domain/valueObjects/passwordHash.js';

/**
 * In-memory stand-ins for the domain and use-case interfaces, so the use
 * cases can be tested without a database, a broker or bcrypt.
 */
export class InMemoryUserRepository implements UserRepository {
  readonly users = new Map<string, User>();

  findByEmail(email: string): Promise<User | null> {
    return Promise.resolve(this.users.get(email) ?? null);
  }

  create(user: User): Promise<User> {
    this.users.set(user.email, user);
    return Promise.resolve(user);
  }

  deleteById(userId: string): Promise<void> {
    for (const [email, user] of this.users) {
      if (user.id === userId) {
        this.users.delete(email);
      }
    }
    return Promise.resolve();
  }
}

export class InMemoryEventPublisher implements EventPublisher {
  readonly published: EventPublisherInput[] = [];
  failWith: Error | null = null;

  publish(input: EventPublisherInput): Promise<void> {
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }
    this.published.push(input);
    return Promise.resolve();
  }
}

export class FakeHasher implements PasswordHasher {
  readonly verifiedAgainst: PasswordHash[] = [];
  hashCalls = 0;

  hash(password: string): Promise<PasswordHash> {
    this.hashCalls += 1;
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
