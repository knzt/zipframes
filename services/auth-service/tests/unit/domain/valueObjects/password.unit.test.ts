import { describe, expect, it } from 'vitest';

import { createPassword } from '../../../../src/domain/valueObjects/password.js';

describe('valid passwords', () => {
  it.each(['senha123', 'correct-horse-1', 'A1bcdefg', '12345678a'])('accepts %s', (raw) => {
    expect(createPassword(raw)).toEqual({ ok: true, value: raw });
  });

  it('accepts a password at the maximum length', () => {
    const raw = `${'a'.repeat(71)}1`;
    expect(Buffer.byteLength(raw, 'utf8')).toBe(72);
    expect(createPassword(raw).ok).toBe(true);
  });

  it('accepts 72 UTF-8 bytes even when that is fewer than 72 characters', () => {
    const raw = `${'é'.repeat(35)}12`;
    expect(raw.length).toBeLessThan(72);
    expect(Buffer.byteLength(raw, 'utf8')).toBe(72);
    expect(createPassword(raw).ok).toBe(true);
  });

  it('accepts letters from any alphabet, not only ASCII', () => {
    expect(createPassword('señaló12').ok).toBe(true);
    expect(createPassword('пароль12').ok).toBe(true);
  });
});

describe('rejected passwords', () => {
  it('rejects one shorter than 8 characters', () => {
    expect(createPassword('abc1234')).toMatchObject({ ok: false, error: { code: 'TOO_SHORT' } });
  });

  it("rejects one longer than bcrypt's 72-byte limit", () => {
    // Anything past 72 bytes is silently truncated by bcrypt, so accepting
    // it would mean telling the user characters count when they do not.
    const raw = `${'a'.repeat(72)}1`;
    expect(createPassword(raw)).toMatchObject({ ok: false, error: { code: 'TOO_LONG' } });
  });

  it('rejects a multibyte password whose UTF-8 encoding exceeds 72 bytes', () => {
    const raw = `${'é'.repeat(36)}1`;
    expect(raw.length).toBeLessThanOrEqual(72);
    expect(Buffer.byteLength(raw, 'utf8')).toBeGreaterThan(72);
    expect(createPassword(raw)).toMatchObject({ ok: false, error: { code: 'TOO_LONG' } });
  });

  it('rejects one with no letter', () => {
    expect(createPassword('12345678')).toMatchObject({ ok: false, error: { code: 'NO_LETTER' } });
  });

  it('rejects one with no digit', () => {
    expect(createPassword('abcdefgh')).toMatchObject({ ok: false, error: { code: 'NO_DIGIT' } });
  });
});
