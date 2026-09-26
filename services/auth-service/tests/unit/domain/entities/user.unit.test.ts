import { ValidationError } from '@zipframes/core';
import { describe, expect, it } from 'vitest';

import { User, userRegisteredFrom } from '../../../../src/domain/index.js';

const validInput = {
  id: '0194f3a0-0000-7000-8000-000000000001',
  name: 'Hellen Santos',
  email: 'hellen@example.com',
  now: new Date('2026-01-01T12:00:00.000Z'),
};

const passwordHash = '$2b$12$abcdefghijklmnopqrstuv';

const createdUser = (
  input: { id: string; name: string; email: string; now: Date } = validInput,
): User => {
  const result = User.create(input);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw result.error;
  }
  return result.value.withPasswordHash(passwordHash);
};

describe('User.create', () => {
  it('builds a user from valid input', () => {
    const user = createdUser();

    expect(user.id).toBe(validInput.id);
    expect(user.name).toBe('Hellen Santos');
    expect(user.email).toBe('hellen@example.com');
    expect(user.passwordHash).toBe(passwordHash);
    expect(user.createdAt).toBe(validInput.now);
    expect(user.updatedAt).toBe(validInput.now);
  });

  it('normalizes the email, so two accounts cannot differ only by case', () => {
    const user = createdUser({ ...validInput, email: 'Hellen@Example.COM' });

    expect(user.email).toBe('hellen@example.com');
  });

  it('collapses whitespace in the name', () => {
    const user = createdUser({ ...validInput, name: '  Hellen   Santos  ' });

    expect(user.name).toBe('Hellen Santos');
  });

  it('rejects an invalid name', () => {
    const result = User.create({ ...validInput, name: 'H' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.code).toBe('INVALID_NAME');
  });

  it('rejects an invalid email', () => {
    const result = User.create({ ...validInput, email: 'not-an-email' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(result.error.code).toBe('INVALID_EMAIL');
  });

  it('checks the name before the email, reporting the first problem found', () => {
    const result = User.create({ ...validInput, name: '', email: 'also-invalid' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.error.code).toBe('INVALID_NAME');
  });
});

describe('User.fromPersistence', () => {
  it('rehydrates without revalidating name or email', () => {
    const persisted = {
      id: validInput.id,
      name: validInput.name,
      email: validInput.email,
      passwordHash,
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
    const user = createdUser();

    const event = userRegisteredFrom(user);

    expect(event).toEqual({
      userId: validInput.id,
      name: 'Hellen Santos',
      email: 'hellen@example.com',
    });
    expect(event).not.toHaveProperty('passwordHash');
  });
});
