import { ValidationError } from '@zipframes/core';
import { describe, expect, it } from 'vitest';

import { User, userRegisteredFrom } from '../../../../src/domain/index.js';

const validInput = {
  id: '0194f3a0-0000-7000-8000-000000000001',
  name: 'Hellen Santos',
  email: 'hellen@example.com',
  passwordHash: '$2b$12$abcdefghijklmnopqrstuv',
  now: new Date('2026-01-01T12:00:00.000Z'),
};

describe('new User', () => {
  it('builds a user from valid input', () => {
    const user = new User(validInput);

    expect(user.id).toBe(validInput.id);
    expect(user.name).toBe('Hellen Santos');
    expect(user.email).toBe('hellen@example.com');
    expect(user.passwordHash).toBe(validInput.passwordHash);
    expect(user.createdAt).toBe(validInput.now);
    expect(user.updatedAt).toBe(validInput.now);
  });

  it('normalizes the email, so two accounts cannot differ only by case', () => {
    const user = new User({ ...validInput, email: 'Hellen@Example.COM' });

    expect(user.email).toBe('hellen@example.com');
  });

  it('collapses whitespace in the name', () => {
    const user = new User({ ...validInput, name: '  Hellen   Santos  ' });

    expect(user.name).toBe('Hellen Santos');
  });

  it('rejects an invalid name', () => {
    expect(() => new User({ ...validInput, name: 'H' })).toThrow(ValidationError);

    try {
      new User({ ...validInput, name: 'H' });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      if (error instanceof ValidationError) {
        expect(error.code).toBe('INVALID_NAME');
      }
    }
  });

  it('rejects an invalid email', () => {
    expect(() => new User({ ...validInput, email: 'not-an-email' })).toThrow(ValidationError);

    try {
      new User({ ...validInput, email: 'not-an-email' });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      if (error instanceof ValidationError) {
        expect(error.code).toBe('INVALID_EMAIL');
      }
    }
  });

  it('checks the name before the email, reporting the first problem found', () => {
    try {
      new User({ ...validInput, name: '', email: 'also-invalid' });
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      if (error instanceof ValidationError) {
        expect(error.code).toBe('INVALID_NAME');
      }
    }
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
    const user = new User(validInput);

    const event = userRegisteredFrom(user);

    expect(event).toEqual({
      userId: validInput.id,
      name: 'Hellen Santos',
      email: 'hellen@example.com',
    });
    expect(event).not.toHaveProperty('passwordHash');
  });
});
