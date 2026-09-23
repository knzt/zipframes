import { describe, expect, it } from 'vitest';

import { BcryptPasswordHasher } from '../../src/infrastructure/crypto/bcrypt-password-hasher.js';
import { createPassword } from '../../src/domain/password.js';
import type { Password } from '../../src/domain/password.js';

const hasher = new BcryptPasswordHasher();

const password = (raw: string): Password => {
  const result = createPassword(raw);
  if (!result.ok) throw new Error('expected a valid password');
  return result.value;
};

describe('hash', () => {
  it('produces a bcrypt hash, not the plaintext', async () => {
    const hash = await hasher.hash(password('senha1234'));

    expect(hash).not.toBe('senha1234');
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/);
  });

  it('produces a different hash each time, thanks to a random salt', async () => {
    const [a, b] = await Promise.all([
      hasher.hash(password('senha1234')),
      hasher.hash(password('senha1234')),
    ]);

    expect(a).not.toBe(b);
  });
});

describe('verify', () => {
  it('accepts the correct password', async () => {
    const hash = await hasher.hash(password('senha1234'));

    expect(await hasher.verify('senha1234', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hasher.hash(password('senha1234'));

    expect(await hasher.verify('outraSenha1', hash)).toBe(false);
  });

  it('rejects an empty password against a real hash', async () => {
    const hash = await hasher.hash(password('senha1234'));

    expect(await hasher.verify('', hash)).toBe(false);
  });

  it('rejects a password when there is no stored hash, after a real comparison', async () => {
    expect(await hasher.verify('senha1234', null)).toBe(false);
    expect(await hasher.verify('senha1234', null)).toBe(false);
  });
});
