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

describe('PrismaUserRepository.findByEmail', () => {
  it('queries with findFirst on email', async () => {
    const findFirst = vi.fn(async () => null);
    const prisma = { user: { findFirst, create: vi.fn() } };
    const repository = new PrismaUserRepository(prisma as never);

    await repository.findByEmail('ada@example.com');

    expect(findFirst).toHaveBeenCalledWith({ where: { email: 'ada@example.com' } });
  });

  it('maps a row to the domain user', async () => {
    const row = {
      id: sampleUser.id,
      name: sampleUser.name,
      email: sampleUser.email,
      passwordHash: sampleUser.passwordHash,
      createdAt: sampleUser.createdAt,
      updatedAt: sampleUser.updatedAt,
    };
    const prisma = {
      user: {
        findFirst: vi.fn(async () => row),
        create: vi.fn(),
      },
    };
    const repository = new PrismaUserRepository(prisma as never);

    await expect(repository.findByEmail(sampleUser.email)).resolves.toEqual(sampleUser);
  });
});

describe('PrismaUserRepository.create', () => {
  it('inserts the user row', async () => {
    const create = vi.fn(async () => ({}));
    const prisma = { user: { findFirst: vi.fn(), create } };
    const repository = new PrismaUserRepository(prisma as never);

    await repository.create(sampleUser);

    expect(create).toHaveBeenCalledWith({
      data: {
        id: sampleUser.id,
        name: sampleUser.name,
        email: sampleUser.email,
        passwordHash: sampleUser.passwordHash,
        createdAt: sampleUser.createdAt,
        updatedAt: sampleUser.updatedAt,
      },
    });
  });

  it('rethrows prisma errors without mapping them', async () => {
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.2.1',
      meta: { target: ['email'] },
    });
    const prisma = {
      user: {
        findFirst: vi.fn(),
        create: vi.fn(async () => {
          throw prismaError;
        }),
      },
    };
    const repository = new PrismaUserRepository(prisma as never);

    await expect(repository.create(sampleUser)).rejects.toBe(prismaError);
  });
});
