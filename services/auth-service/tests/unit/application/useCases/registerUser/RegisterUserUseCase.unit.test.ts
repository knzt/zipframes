import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegisterUserUseCase } from '../../../../../src/application/useCases/registerUser/RegisterUserUseCase.js';
import {
  FakeHasher,
  FixedClock,
  InMemoryEventPublisher,
  InMemoryUserRepository,
  SequentialIds,
} from '../../../../support/in-memory.js';

let userRepository: InMemoryUserRepository;
let eventPublisher: InMemoryEventPublisher;
let registerUser: RegisterUserUseCase;
let onPublishFailed: ReturnType<typeof vi.fn>;

beforeEach(() => {
  userRepository = new InMemoryUserRepository();
  eventPublisher = new InMemoryEventPublisher();
  onPublishFailed = vi.fn();
  registerUser = new RegisterUserUseCase(
    userRepository,
    new FakeHasher(),
    new SequentialIds(),
    new FixedClock(),
    eventPublisher,
    onPublishFailed,
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

    const stored = userRepository.users.get('hellen@example.com');
    expect(stored?.passwordHash).toBe('hashed:senha1234');
    expect(stored?.passwordHash).not.toBe('senha1234');
  });

  it('creates the user and then publishes user.registered', async () => {
    await registerUser.execute(validInput);

    expect(userRepository.users.size).toBe(1);
    expect(eventPublisher.published).toEqual([
      {
        eventType: 'user.registered',
        correlationId: '0194f3a0-0000-7000-8000-000000000099',
        payload: {
          userId: '0194f3a0-0000-7000-8000-000000000001',
          name: 'Hellen Santos',
          email: 'hellen@example.com',
        },
      },
    ]);
  });

  it('does not put the password hash in the registration fact', async () => {
    await registerUser.execute(validInput);

    expect(JSON.stringify(eventPublisher.published[0])).not.toContain('hashed:');
  });
});

describe('invalid input', () => {
  it('rejects a password that fails the policy', async () => {
    const result = await registerUser.execute({ ...validInput, password: 'curta1' });

    expect(result).toMatchObject({ ok: false, error: { code: 'TOO_SHORT' } });
    expect(userRepository.users.size).toBe(0);
    expect(eventPublisher.published).toHaveLength(0);
  });

  it('rejects an invalid email', async () => {
    const result = await registerUser.execute({ ...validInput, email: 'not-an-email' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_EMAIL' } });
    expect(eventPublisher.published).toHaveLength(0);
  });

  it('rejects an invalid name', async () => {
    const result = await registerUser.execute({ ...validInput, name: 'H' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_NAME' } });
  });

  it('checks the password before hashing anything else', async () => {
    const result = await registerUser.execute({ ...validInput, password: 'x' });

    expect(result.ok).toBe(false);
    expect(eventPublisher.published).toHaveLength(0);
  });
});

describe('duplicate email', () => {
  it('reports EMAIL_TAKEN when the address is already registered', async () => {
    await registerUser.execute(validInput);

    const result = await registerUser.execute({ ...validInput, name: 'Outra Pessoa' });

    expect(result).toMatchObject({ ok: false, error: { code: 'EMAIL_TAKEN' } });
    expect(userRepository.users.size).toBe(1);
    expect(eventPublisher.published).toHaveLength(1);
  });

  it('treats addresses differing only by case as the same', async () => {
    await registerUser.execute(validInput);

    const result = await registerUser.execute({ ...validInput, email: 'HELLEN@EXAMPLE.COM' });

    expect(result).toMatchObject({ ok: false, error: { code: 'EMAIL_TAKEN' } });
  });
});

describe('repository create failure', () => {
  it('propagates when create loses a concurrent registration race', async () => {
    const raceRepository = {
      findByEmail: async () => null,
      create: async (): Promise<never> => {
        throw new Error('unique constraint');
      },
    };
    const useCase = new RegisterUserUseCase(
      raceRepository,
      new FakeHasher(),
      new SequentialIds(),
      new FixedClock(),
      eventPublisher,
    );

    await expect(useCase.execute(validInput)).rejects.toThrow('unique constraint');
    expect(eventPublisher.published).toHaveLength(0);
  });
});

describe('publish after create', () => {
  it('still returns registration success when publish fails', async () => {
    eventPublisher.failWith = new Error('broker down');

    const result = await registerUser.execute(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe('hellen@example.com');
    expect(userRepository.users.size).toBe(1);
    expect(onPublishFailed).toHaveBeenCalledOnce();
    expect(onPublishFailed).toHaveBeenCalledWith(eventPublisher.failWith, {
      userId: '0194f3a0-0000-7000-8000-000000000001',
      correlationId: validInput.correlationId,
    });
  });

  it('does not turn a publish failure into EMAIL_TAKEN', async () => {
    eventPublisher.failWith = new Error('broker down');

    const result = await registerUser.execute(validInput);

    expect(result).not.toMatchObject({ ok: false, error: { code: 'EMAIL_TAKEN' } });
  });

  it('still succeeds when publish fails and no failure handler is provided', async () => {
    const eventPublisher = new InMemoryEventPublisher();
    eventPublisher.failWith = new Error('broker down');
    const useCase = new RegisterUserUseCase(
      new InMemoryUserRepository(),
      new FakeHasher(),
      new SequentialIds(),
      new FixedClock(),
      eventPublisher,
    );

    const result = await useCase.execute(validInput);

    expect(result.ok).toBe(true);
  });
});
