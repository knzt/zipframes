import { beforeEach, describe, expect, it } from 'vitest';

import type { Result } from '@zipframes/core';

import type { EventOutbox } from '../../../../../src/application/interfaces/gateways/EventOutbox.js';
import {
  UserEmailTakenError,
  type UserRepository,
  type UserRepositoryEmailTakenError,
} from '../../../../../src/application/interfaces/repositories/UserRepository.js';
import { RegisterUserUseCase } from '../../../../../src/application/useCases/registerUser/RegisterUserUseCase.js';
import type { User } from '../../../../../src/domain/entities/user.js';
import {
  FakeHasher,
  FixedClock,
  InMemoryEventOutbox,
  InMemoryUnitOfWork,
  InMemoryUserRepository,
  SequentialIds,
} from '../../../../support/in-memory.js';

let users: InMemoryUserRepository;
let events: InMemoryEventOutbox;
let uow: InMemoryUnitOfWork;
let registerUser: RegisterUserUseCase;

beforeEach(() => {
  users = new InMemoryUserRepository();
  events = new InMemoryEventOutbox();
  uow = new InMemoryUnitOfWork();
  registerUser = new RegisterUserUseCase(
    users,
    events,
    uow,
    new FakeHasher(),
    new SequentialIds(),
    new FixedClock(),
  );
});

const validInput = {
  name: 'Hellen Santos',
  email: 'hellen@example.com',
  password: 'senha1234',
  correlationId: '0194f3a0-0000-7000-8000-000000000099',
};

describe('a successful registration', () => {
  it('returns the created user without the password', async () => {
    const result = await registerUser.execute(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      userId: '0194f3a0-0000-7000-8000-000000000001',
      name: 'Hellen Santos',
      email: 'hellen@example.com',
    });
    expect(JSON.stringify(result.value)).not.toContain('senha1234');
  });

  it('stores the hash, never the plaintext password', async () => {
    await registerUser.execute(validInput);

    const stored = users.users.get('hellen@example.com');
    expect(stored?.passwordHash).toBe('hashed:senha1234');
    expect(stored?.passwordHash).not.toBe('senha1234');
  });

  it('saves the user and records UserRegistered inside one unit of work', async () => {
    await registerUser.execute(validInput);

    expect(uow.runCount).toBe(1);
    expect(users.users.size).toBe(1);
    expect(events.recorded).toEqual([
      {
        event: {
          userId: '0194f3a0-0000-7000-8000-000000000001',
          name: 'Hellen Santos',
          email: 'hellen@example.com',
        },
        correlationId: '0194f3a0-0000-7000-8000-000000000099',
      },
    ]);
  });

  it('does not put the password hash in the registration fact', async () => {
    await registerUser.execute(validInput);

    expect(JSON.stringify(events.recorded[0])).not.toContain('hashed:');
  });
});

describe('invalid input', () => {
  it('rejects a password that fails the policy', async () => {
    const result = await registerUser.execute({ ...validInput, password: 'curta1' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(users.users.size).toBe(0);
    expect(uow.runCount).toBe(0);
  });

  it('rejects an invalid email', async () => {
    const result = await registerUser.execute({ ...validInput, email: 'not-an-email' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(events.recorded).toHaveLength(0);
  });

  it('rejects an invalid name', async () => {
    const result = await registerUser.execute({ ...validInput, name: 'H' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('checks the password before hashing anything else', async () => {
    const result = await registerUser.execute({ ...validInput, password: 'x' });

    expect(result.ok).toBe(false);
    expect(events.recorded).toHaveLength(0);
  });
});

describe('duplicate email', () => {
  it('reports EMAIL_TAKEN when the address is already registered', async () => {
    await registerUser.execute(validInput);

    const result = await registerUser.execute({ ...validInput, name: 'Outra Pessoa' });

    expect(result).toMatchObject({ ok: false, error: { code: 'EMAIL_TAKEN' } });
    expect(users.users.size).toBe(1);
    expect(events.recorded).toHaveLength(1);
  });

  it('treats addresses differing only by case as the same', async () => {
    await registerUser.execute(validInput);

    const result = await registerUser.execute({ ...validInput, email: 'HELLEN@EXAMPLE.COM' });

    expect(result).toMatchObject({ ok: false, error: { code: 'EMAIL_TAKEN' } });
  });

  it('maps a unique-violation thrown inside the transaction to EMAIL_TAKEN', async () => {
    const throwingUsers: UserRepository = {
      findByEmail: () => Promise.resolve(null),
      save: (_user: User): Promise<Result<void, UserRepositoryEmailTakenError>> => {
        throw new UserEmailTakenError();
      },
    };
    const silentEvents: EventOutbox = {
      record: () => Promise.resolve(),
    };
    const useCase = new RegisterUserUseCase(
      throwingUsers,
      silentEvents,
      new InMemoryUnitOfWork(),
      new FakeHasher(),
      new SequentialIds(),
      new FixedClock(),
    );

    const result = await useCase.execute(validInput);

    expect(result).toMatchObject({ ok: false, error: { code: 'EMAIL_TAKEN' } });
  });

  it('propagates unexpected persistence failures', async () => {
    const explodingUsers: UserRepository = {
      findByEmail: () => Promise.resolve(null),
      save: () => Promise.reject(new Error('disk full')),
    };
    const useCase = new RegisterUserUseCase(
      explodingUsers,
      events,
      new InMemoryUnitOfWork(),
      new FakeHasher(),
      new SequentialIds(),
      new FixedClock(),
    );

    await expect(useCase.execute(validInput)).rejects.toThrow('disk full');
    expect(events.recorded).toHaveLength(0);
  });
});
