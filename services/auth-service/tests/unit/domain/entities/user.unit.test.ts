import { describe, expect, it } from 'vitest';

import { User, userRegisteredFrom } from '../../../../src/domain/index.js';

const validInput = {
  id: '0194f3a0-0000-7000-8000-000000000001',
  name: 'Hellen Santos',
  email: 'hellen@example.com',
  passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
  now: new Date('2026-01-01T12:00:00.000Z'),
};

describe('User.register', () => {
  it('builds a user from valid input', () => {
    const result = User.register(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(validInput.id);
    expect(result.value.name).toBe('Hellen Santos');
    expect(result.value.email).toBe('hellen@example.com');
    expect(result.value.passwordHash).toBe(validInput.passwordHash);
    expect(result.value.createdAt).toBe(validInput.now);
    expect(result.value.updatedAt).toBe(validInput.now);
  });

  it('normalizes the email, so two accounts cannot differ only by case', () => {
    const result = User.register({ ...validInput, email: 'Hellen@Example.COM' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe('hellen@example.com');
  });

  it('collapses whitespace in the name', () => {
    const result = User.register({ ...validInput, name: '  Hellen   Santos  ' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Hellen Santos');
  });

  it('rejects an invalid name', () => {
    expect(User.register({ ...validInput, name: 'H' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_NAME' },
    });
  });

  it('rejects an invalid email', () => {
    expect(User.register({ ...validInput, email: 'not-an-email' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_EMAIL' },
    });
  });

  it('checks the name before the email, reporting the first problem found', () => {
    expect(User.register({ ...validInput, name: '', email: 'also-invalid' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_NAME' },
    });
  });
});

describe('User.fromPersistence', () => {
  it('rehydrates without revalidating name or email', () => {
    const persisted = {
      id: validInput.id,
      name: validInput.name,
      email: validInput.email,
      passwordHash: validInput.passwordHash,
      createdAt: validInput.now,
      updatedAt: validInput.now,
    };
    const user = User.fromPersistence(persisted);

    expect(user.id).toBe(validInput.id);
    expect(user.toJSON()).toEqual(persisted);
  });
});

describe('userRegisteredFrom', () => {
  it('carries only what the Notification context needs', () => {
    const result = User.register(validInput);
    if (!result.ok) throw new Error('expected a valid user');

    const event = userRegisteredFrom(result.value);

    expect(event).toEqual({
      userId: validInput.id,
      name: 'Hellen Santos',
      email: 'hellen@example.com',
    });
    expect(event).not.toHaveProperty('passwordHash');
  });
});
