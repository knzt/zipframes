import { beforeEach, describe, expect, it } from 'vitest';

import { makeRegisterUser } from '../../../../../src/application/useCases/registerUser/registerUser.useCase.js';
import {
  FakeHasher,
  FixedClock,
  InMemoryUserRepository,
  SequentialIds,
} from '../../../../support/in-memory.js';

let users: InMemoryUserRepository;
let registerUser: ReturnType<typeof makeRegisterUser>;

beforeEach(() => {
  users = new InMemoryUserRepository();
  registerUser = makeRegisterUser({
    users,
    hasher: new FakeHasher(),
    ids: new SequentialIds(),
    clock: new FixedClock(),
  });
});

const validCommand = {
  name: 'Hellen Santos',
  email: 'hellen@example.com',
  password: 'senha1234',
  correlationId: '0194f3a0-0000-7000-8000-000000000099',
};

describe('a successful registration', () => {
  it('returns the created user without the password', async () => {
    const result = await registerUser(validCommand);

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
    await registerUser(validCommand);

    const stored = users.users.get('hellen@example.com');
    expect(stored?.passwordHash).toBe('hashed:senha1234');
    expect(stored?.passwordHash).not.toBe('senha1234');
  });

  it('asks the repository to store the user and the registration together', async () => {
    await registerUser(validCommand);

    expect(users.users.size).toBe(1);
    expect(users.events).toEqual([
      {
        id: '0194f3a0-0000-7000-8000-000000000002',
        aggregateType: 'User',
        aggregateId: '0194f3a0-0000-7000-8000-000000000001',
        eventType: 'user.registered',
        version: 1,
        payload: {
          userId: '0194f3a0-0000-7000-8000-000000000001',
          name: 'Hellen Santos',
          email: 'hellen@example.com',
        },
        correlationId: '0194f3a0-0000-7000-8000-000000000099',
        occurredAt: new Date('2026-01-01T12:00:00.000Z'),
      },
    ]);
  });

  it('does not put the password hash in the registration fact', async () => {
    await registerUser(validCommand);

    expect(JSON.stringify(users.events[0])).not.toContain('hashed:');
  });
});

describe('invalid input', () => {
  it('rejects a password that fails the policy', async () => {
    const result = await registerUser({ ...validCommand, password: 'curta1' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(users.users.size).toBe(0);
  });

  it('rejects an invalid email', async () => {
    const result = await registerUser({ ...validCommand, email: 'not-an-email' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(users.events).toHaveLength(0);
  });

  it('rejects an invalid name', async () => {
    const result = await registerUser({ ...validCommand, name: 'H' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('checks the password before hashing anything else', async () => {
    const result = await registerUser({ ...validCommand, password: 'x' });

    expect(result.ok).toBe(false);
    expect(users.events).toHaveLength(0);
  });
});

describe('duplicate email', () => {
  it('reports EMAIL_TAKEN when the address is already registered', async () => {
    await registerUser(validCommand);

    const result = await registerUser({ ...validCommand, name: 'Outra Pessoa' });

    expect(result).toMatchObject({ ok: false, error: { code: 'EMAIL_TAKEN' } });
    expect(users.users.size).toBe(1);
  });

  it('treats addresses differing only by case as the same', async () => {
    await registerUser(validCommand);

    const result = await registerUser({ ...validCommand, email: 'HELLEN@EXAMPLE.COM' });

    expect(result).toMatchObject({ ok: false, error: { code: 'EMAIL_TAKEN' } });
  });
});
