import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { PrismaUserRepository } from '../../../../../src/infrastructure/repositories/prisma/user.repository.js';
import { asUserId } from '../../../../../src/domain/entities/user.js';
import { asPasswordHash } from '../../../../../src/domain/valueObjects/password.js';

const sampleUser = {
  id: asUserId('0194f3a0-0000-7000-8000-000000000001'),
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  passwordHash: asPasswordHash('hashed:secret'),
  createdAt: new Date('2026-01-01T12:00:00.000Z'),
  updatedAt: new Date('2026-01-01T12:00:00.000Z'),
};

describe('PrismaUserRepository.save', () => {
  it('maps an email unique violation to ConflictError', async () => {
    const prisma = {
      user: {
        create: vi.fn(async () => {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '6.2.1',
            meta: { target: ['email'] },
          });
        }),
      },
    };
    const repository = new PrismaUserRepository(prisma as never);

    const result = await repository.save(sampleUser);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('rethrows a unique violation on another field', async () => {
    const prisma = {
      user: {
        create: vi.fn(async () => {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: '6.2.1',
            meta: { target: ['id'] },
          });
        }),
      },
    };
    const repository = new PrismaUserRepository(prisma as never);

    await expect(repository.save(sampleUser)).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });
});
