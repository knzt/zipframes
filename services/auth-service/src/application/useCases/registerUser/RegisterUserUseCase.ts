import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { userRegisteredFrom } from '../../../domain/events/userRegistered.js';
import { registerUser } from '../../../domain/entities/user.js';
import { createPassword } from '../../../domain/valueObjects/password.js';
import type {
  OutboxEventWrite,
  UserRepository,
} from '../../interfaces/repositories/user.repository.js';
import type { Clock } from '../../interfaces/services/clock.service.js';
import type { IdGenerator } from '../../interfaces/services/idGenerator.service.js';
import type { PasswordHasher } from '../../interfaces/services/passwordHasher.service.js';
import type {
  RegisterUserCommand,
  RegisterUserError,
  RegisterUserResult,
} from './registerUser.types.js';

export class RegisterUserUseCase {
  constructor(
    private readonly deps: {
      readonly users: UserRepository;
      readonly hasher: PasswordHasher;
      readonly ids: IdGenerator;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    command: RegisterUserCommand,
  ): Promise<Result<RegisterUserResult, RegisterUserError>> {
    const password = createPassword(command.password);
    if (!password.ok) {
      return err({ code: 'INVALID_INPUT' as const, message: password.error.message });
    }

    const passwordHash = await this.deps.hasher.hash(password.value);
    const now = this.deps.clock.now();

    const user = registerUser({
      id: this.deps.ids.next(),
      name: command.name,
      email: command.email,
      passwordHash,
      now,
    });
    if (!user.ok) {
      return err({ code: 'INVALID_INPUT' as const, message: user.error.message });
    }

    const registered = userRegisteredFrom(user.value);
    const outbox: OutboxEventWrite = {
      id: this.deps.ids.next(),
      aggregateType: 'User',
      aggregateId: user.value.id,
      eventType: 'user.registered',
      version: 1,
      payload: { ...registered },
      correlationId: command.correlationId,
      occurredAt: user.value.createdAt,
    };

    const saved = await this.deps.users.save(user.value, outbox);
    if (!saved.ok) {
      return err({ code: 'EMAIL_TAKEN' as const, message: 'email is already registered' });
    }

    return ok({
      userId: user.value.id,
      name: user.value.name,
      email: user.value.email,
    });
  }
}
