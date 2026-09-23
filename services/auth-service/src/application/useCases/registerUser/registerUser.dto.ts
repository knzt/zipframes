import type { UserRepository } from '../../ports/repositories/user.repository.js';
import type { Clock } from '../../ports/services/clock.service.js';
import type { IdGenerator } from '../../ports/services/idGenerator.service.js';
import type { PasswordHasher } from '../../ports/services/passwordHasher.service.js';

export interface RegisterUserCommand {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly correlationId: string;
}

export interface RegisterUserResult {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
}

export interface RegisterUserError {
  readonly code: 'INVALID_INPUT' | 'EMAIL_TAKEN';
  readonly message: string;
}

export interface RegisterUserDependencies {
  readonly users: UserRepository;
  readonly hasher: PasswordHasher;
  readonly ids: IdGenerator;
  readonly clock: Clock;
}
