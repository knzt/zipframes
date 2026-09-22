import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { createPassword } from '../../domain/password.js';
import { registerUser, userRegisteredFrom } from '../../domain/user.js';
import type {
  Clock,
  IdGenerator,
  OutboxEvent,
  PasswordHasher,
  UserRepository,
} from '../ports/index.js';

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
    // correlationId (it is how a trace is followed from the request that
    // caused it through every service the event reaches). A caller with no
    // incoming id — a test, a script, a request that arrived without one —
    // still gets one minted here, rather than leaving it for the relay to
    // notice missing at publish time.
    const event: OutboxEvent = {
      id: deps.ids.next(),
      aggregateType: 'User',
      aggregateId: user.value.id,
      eventType: 'user.registered',
      version: 1,
      payload: { ...userRegisteredFrom(user.value) },
      correlationId: command.correlationId ?? deps.ids.next(),
      occurredAt: now,
    };

    // Uniqueness is enforced by the database, not by a prior read: two
    // concurrent registrations with the same email would both pass a
    // check-then-insert.
    const saved = await deps.users.saveWithEvent(user.value, event);
    if (!saved.ok) {
      return err({ code: 'EMAIL_TAKEN' as const, message: 'email is already registered' });
    }

    return ok({
      userId: user.value.id,
      name: user.value.name,
      email: user.value.email,
    });
  };
