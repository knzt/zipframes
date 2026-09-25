import type { Result } from '@zipframes/core';

import type { User } from '../../../domain/entities/user.js';

export interface UserRepositoryEmailTakenError {
  readonly code: 'EMAIL_TAKEN';
}

export interface UserRepositoryOutboxEventWrite {
  readonly id: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly eventType: string;
  readonly version: number;
  readonly payload: Record<string, unknown>;
  readonly correlationId: string;
  readonly occurredAt: Date;
}

export interface UserRepository {
  findByEmail: (email: string) => Promise<User | null>;
  /**
   * Persists the user and the outbox row together, in one transaction.
   * A registration is never recorded without its user, and a user is never
   * stored without the fact that they registered.
   */
  save: (
    user: User,
    outbox: UserRepositoryOutboxEventWrite,
  ) => Promise<Result<void, UserRepositoryEmailTakenError>>;
}
