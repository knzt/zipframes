import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { userRegisteredFrom } from '../../../domain/events/userRegistered.js';
import { registerUser } from '../../../domain/entities/user.js';
import { createPassword } from '../../../domain/valueObjects/password.js';
import type {
  OutboxEventWrite,
  UserRepository,
} from '../../interfaces/repositories/UserRepository.js';
import type { Clock } from '../../interfaces/services/Clock.js';
import type { IdGenerator } from '../../interfaces/services/IdGenerator.js';
import type { PasswordHasher } from '../../interfaces/services/PasswordHasher.js';
import type {
  RegisterUserCommand,
  RegisterUserError,
  RegisterUserResult,
} from './registerUser.types.js';

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RegisterUserCommand,
  ): Promise<Result<RegisterUserResult, RegisterUserError>> {
    const password = createPassword(command.password);
    if (!password.ok) {
      return err({ code: 'INVALID_INPUT' as const, message: password.error.message });
    }

    const passwordHash = await this.hasher.hash(password.value);
    const now = this.clock.now();

    const user = registerUser({
      id: this.ids.next(),
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
      id: this.ids.next(),
      aggregateType: 'User',
      aggregateId: user.value.id,
      eventType: 'user.registered',
      version: 1,
      payload: { ...registered },
      correlationId: command.correlationId,
      occurredAt: user.value.createdAt,
    };

    const saved = await this.users.save(user.value, outbox);
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
