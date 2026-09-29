import type { Brand } from '@zipframes/core';

/**
 * A bcrypt hash. Kept distinct from `Password` on purpose: the two must
 * never be mixed up, and only the hash is ever persisted.
 *
 * This stays in the service while `Password` lives in
 * `@zipframes/value-objects`, because a hash is not a validated value —
 * it is whatever the hashing adapter produced, and its shape is that
 * adapter's business.
 */
export type PasswordHash = Brand<string, 'PasswordHash'>;

export const asPasswordHash = (hash: string): PasswordHash => hash as PasswordHash;
