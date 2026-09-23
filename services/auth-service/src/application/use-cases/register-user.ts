import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { createPassword } from '../../domain/password.js';
import type { PasswordHasher } from '../../domain/password-hasher.js';
import type { UserRepository } from '../../domain/user-repository.js';
import { registerUser, userRegisteredFrom } from '../../domain/user.js';
import type { Clock } from '../clock.js';
import type { IdGenerator } from '../id-generator.js';

export interface RegisterUserCommand {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly correlationId?: string | undefined;
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

export const makeRegisterUser =
  (deps: RegisterUserDependencies) =>
  async (command: RegisterUserCommand): Promise<Result<RegisterUserResult, RegisterUserError>> => {
    const password = createPassword(command.password);
    if (!password.ok) {
      return err({ code: 'INVALID_INPUT' as const, message: password.error.message });
    }

    const passwordHash = await deps.hasher.hash(password.value);
    const now = deps.clock.now();

    const user = registerUser({
      id: deps.ids.next(),
      name: command.name,
      email: command.email,
      passwordHash,
      now,
    });
    if (!user.ok) {
      return err({ code: 'INVALID_INPUT' as const, message: user.error.message });
    }

    // @zipframes/schemas requires every published envelope to carry a real
    // correlationId. A caller with no incoming id still gets one minted
    // here, rather than leaving it for the relay to notice missing at
    // publish time. The outbox row itself is the repository's concern.
    const correlationId = command.correlationId ?? deps.ids.next();
    const saved = await deps.users.save(user.value, userRegisteredFrom(user.value), correlationId);
    if (!saved.ok) {
      return err({ code: 'EMAIL_TAKEN' as const, message: 'email is already registered' });
    }

    return ok({
      userId: user.value.id,
      name: user.value.name,
      email: user.value.email,
    });
  };
