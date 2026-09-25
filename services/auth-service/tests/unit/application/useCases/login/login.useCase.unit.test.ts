import { beforeEach, describe, expect, it } from 'vitest';

import { makeLogin } from '../../../../../src/application/useCases/login/login.useCase.js';
import { makeRegisterUser } from '../../../../../src/application/useCases/registerUser/registerUser.useCase.js';
import {
  FakeHasher,
  FakeTokenIssuer,
  FixedClock,
  InMemoryUserRepository,
  SequentialIds,
} from '../../../../support/in-memory.js';

let users: InMemoryUserRepository;
let tokens: FakeTokenIssuer;
let hasher: FakeHasher;
let login: ReturnType<typeof makeLogin>;

beforeEach(async () => {
  users = new InMemoryUserRepository();
  tokens = new FakeTokenIssuer();
  hasher = new FakeHasher();

  await makeRegisterUser({
    users,
    hasher,
    ids: new SequentialIds(),
    clock: new FixedClock(),
  })({
    name: 'Hellen Santos',
    email: 'hellen@example.com',
    password: 'senha1234',
    correlationId: '0194f3a0-0000-7000-8000-000000000099',
  });

  login = makeLogin({ users, hasher, tokens });
  hasher.verifiedAgainst.length = 0;
});

describe('a successful login', () => {
  it('issues a token for the right user', async () => {
    const result = await login({ email: 'hellen@example.com', password: 'senha1234' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      accessToken: 'token-for-0194f3a0-0000-7000-8000-000000000001',
      tokenType: 'Bearer',
      expiresIn: 900,
    });
    expect(tokens.issuedFor).toEqual(['0194f3a0-0000-7000-8000-000000000001']);
  });

  it('accepts the email in any case, since it is normalized', async () => {
    const result = await login({ email: 'Hellen@EXAMPLE.com', password: 'senha1234' });

    expect(result.ok).toBe(true);
  });
});

describe('a failed login', () => {
  it('rejects a wrong password', async () => {
    const result = await login({ email: 'hellen@example.com', password: 'errada123' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_CREDENTIALS' } });
  });

  it('rejects an email that is not registered', async () => {
    const result = await login({ email: 'ninguem@example.com', password: 'senha1234' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_CREDENTIALS' } });
    expect(hasher.verifiedAgainst).toEqual([]);
  });

  it('rejects a malformed email', async () => {
    const result = await login({ email: 'not-an-email', password: 'senha1234' });

    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_CREDENTIALS' } });
    expect(hasher.verifiedAgainst).toEqual([]);
  });

  it('gives the identical error for a wrong password and an unknown email', async () => {
    const wrongPassword = await login({ email: 'hellen@example.com', password: 'errada123' });
    const unknownEmail = await login({ email: 'ninguem@example.com', password: 'senha1234' });
    const malformed = await login({ email: 'nope', password: 'senha1234' });

    expect(wrongPassword).toEqual(unknownEmail);
    expect(unknownEmail).toEqual(malformed);
  });

  it('issues no token when authentication fails', async () => {
    await login({ email: 'hellen@example.com', password: 'errada123' });

    expect(tokens.issuedFor).toHaveLength(0);
  });
});
