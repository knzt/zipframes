import { describe, expect, it } from 'vitest';

import { registerUser, userRegisteredFrom } from '../../src/domain/index.js';

const validInput = {
  id: '0194f3a0-0000-7000-8000-000000000001',
  name: 'Hellen Santos',
  email: 'hellen@example.com',
  passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
  now: new Date('2026-01-01T12:00:00.000Z'),
};

describe('registerUser', () => {
  it('builds a user from valid input', () => {
    const result = registerUser(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: validInput.id,
      name: 'Hellen Santos',
      email: 'hellen@example.com',
      passwordHash: validInput.passwordHash,
      createdAt: validInput.now,
      updatedAt: validInput.now,
    });
  });

  it('normalizes the email, so two accounts cannot differ only by case', () => {
    const result = registerUser({ ...validInput, email: 'Hellen@Example.COM' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.email).toBe('hellen@example.com');
  });

  it('collapses whitespace in the name', () => {
    const result = registerUser({ ...validInput, name: '  Hellen   Santos  ' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('Hellen Santos');
  });

  it('rejects an invalid name', () => {
    expect(registerUser({ ...validInput, name: 'H' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_NAME' },
    });
  });

  it('rejects an invalid email', () => {
    expect(registerUser({ ...validInput, email: 'not-an-email' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_EMAIL' },
    });
  });

  it('checks the name before the email, reporting the first problem found', () => {
    expect(registerUser({ ...validInput, name: '', email: 'also-invalid' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_NAME' },
    });
  });
});

describe('userRegisteredFrom', () => {
  it('carries only what the Notification context needs', () => {
    const result = registerUser(validInput);
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
