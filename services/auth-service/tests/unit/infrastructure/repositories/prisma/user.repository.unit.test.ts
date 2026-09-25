import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { UserRepositoryOutboxEventWrite } from '../../../../../src/application/interfaces/repositories/UserRepository.js';
import { asUserId } from '../../../../../src/domain/entities/user.js';
import type { User } from '../../../../../src/domain/entities/user.js';
import { asPasswordHash } from '../../../../../src/domain/valueObjects/password.js';
import {
  isEmailUniqueViolation,
  PrismaUserRepository,
} from '../../../../../src/infrastructure/repositories/prisma/user.repository.js';

const user: User = {
  id: asUserId('0194f3a0-0000-7000-8000-000000000001'),
  name: 'Hellen Santos',
  email: 'hellen@example.com',
  passwordHash: asPasswordHash('$2a$10$abcdefghijklmnopqrstuuuuuuuuuuuuuuuuuuuuuuuuuuuuu'),
  createdAt: new Date('2026-09-25T00:00:00.000Z'),
  updatedAt: new Date('2026-09-25T00:00:00.000Z'),
};

const outbox: UserRepositoryOutboxEventWrite = {
  id: '0194f3a0-0000-7000-8000-000000000002',
  aggregateType: 'User',
  aggregateId: user.id,
  eventType: 'user.registered',
  version: 1,
  payload: { userId: user.id },
  correlationId: '0194f3a0-0000-7000-8000-000000000099',
  occurredAt: user.createdAt,
};

const uniqueViolation = (target: unknown): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.19.3',
    meta: { target },
  });

const prismaThatRejects = (error: Prisma.PrismaClientKnownRequestError): PrismaClient => {
  const pending = (): Promise<unknown> => Promise.resolve({});
  return {
    user: { create: pending },
    outboxEvent: { create: pending },
    $transaction: (): Promise<never> => Promise.reject(error),
  } as unknown as PrismaClient;
};

describe('isEmailUniqueViolation', () => {
  it('recognizes the email field and the postgres constraint name', () => {
    expect(isEmailUniqueViolation(uniqueViolation(['email']))).toBe(true);
    expect(isEmailUniqueViolation(uniqueViolation('users_email_key'))).toBe(true);
  });

  it('does not treat another unique target as a taken email', () => {
    expect(isEmailUniqueViolation(uniqueViolation(['id']))).toBe(false);
    expect(isEmailUniqueViolation(uniqueViolation(undefined))).toBe(false);
  });
});

describe('PrismaUserRepository.save', () => {
  it('returns EMAIL_TAKEN only when the email unique constraint fails', async () => {
    const repository = new PrismaUserRepository(prismaThatRejects(uniqueViolation(['email'])));

    const result = await repository.save(user, outbox);

    expect(result).toEqual({ ok: false, error: { code: 'EMAIL_TAKEN' } });
  });

  it('rethrows a unique violation that is not the email', async () => {
    const repository = new PrismaUserRepository(prismaThatRejects(uniqueViolation(['id'])));

    await expect(repository.save(user, outbox)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});
