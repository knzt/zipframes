import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { userRegisteredFrom } from '../../../domain/events/userRegistered.js';
import { registerUser } from '../../../domain/entities/user.js';
import { createPassword } from '../../../domain/valueObjects/password.js';
import type { EventOutbox } from '../../interfaces/gateways/EventOutbox.js';
import {
  UserEmailTakenError,
  type UserRepository,
} from '../../interfaces/repositories/UserRepository.js';
import type { Clock } from '../../interfaces/services/Clock.js';
import type { IdGenerator } from '../../interfaces/services/IdGenerator.js';
import type { PasswordHasher } from '../../interfaces/services/PasswordHasher.js';
import type { UnitOfWork } from '../../interfaces/services/UnitOfWork.js';
import type {
  RegisterUserUseCaseError,
  RegisterUserUseCaseInput,
  RegisterUserUseCaseOutput,
} from './registerUser.types.js';

export class RegisterUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly eventOutbox: EventOutbox,
    private readonly uow: UnitOfWork,
    private readonly hasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RegisterUserUseCaseInput,
  ): Promise<Result<RegisterUserUseCaseOutput, RegisterUserUseCaseError>> {
    const password = createPassword(input.password);
    if (!password.ok) {
      return err({ code: 'INVALID_INPUT' as const, message: password.error.message });
    }

    const passwordHash = await this.hasher.hash(password.value);
    const now = this.clock.now();

    const user = registerUser({
      id: this.ids.next(),
      name: input.name,
      email: input.email,
      passwordHash,
      now,
    });
    if (!user.ok) {
      return err({ code: 'INVALID_INPUT' as const, message: user.error.message });
    }

    const registered = userRegisteredFrom(user.value);

    try {
      const saved = await this.uow.run(async () => {
        const result = await this.users.save(user.value);
        if (!result.ok) {
          return result;
        }
        await this.eventOutbox.record(registered, input.correlationId);
        return result;
      });
      if (!saved.ok) {
        return err({ code: 'EMAIL_TAKEN' as const, message: 'email is already registered' });
      }
    } catch (error) {
      if (error instanceof UserEmailTakenError) {
        return err({ code: 'EMAIL_TAKEN' as const, message: 'email is already registered' });
      }
      throw error;
    }

    return ok({
      userId: user.value.id,
      name: user.value.name,
      email: user.value.email,
    });
  }
}
