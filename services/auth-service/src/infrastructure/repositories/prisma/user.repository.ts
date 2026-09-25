import { Prisma, type PrismaClient } from '@prisma/client';

import { ConflictError, err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import type { UserRepository } from '../../../application/interfaces/repositories/UserRepository.js';
import { asUserId } from '../../../domain/entities/user.js';
import type { User } from '../../../domain/entities/user.js';
import { asPasswordHash } from '../../../domain/valueObjects/password.js';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

const isEmailUniqueViolation = (target: unknown): boolean => {
  if (Array.isArray(target)) {
    return target.includes('email');
  }
  if (typeof target === 'string') {
    return target === 'email' || target.endsWith('_email_key');
  }
  return false;
};

const toDomain = (row: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}): User => ({
  id: asUserId(row.id),
  name: row.name,
  email: row.email,
  passwordHash: asPasswordHash(row.passwordHash),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row === null ? null : toDomain(row);
  }

  async save(user: User): Promise<Result<void, ConflictError>> {
    try {
      await this.prisma.user.create({
        data: {
          id: user.id,
          name: user.name,
          email: user.email,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      });
      return ok(undefined);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION &&
        isEmailUniqueViolation(error.meta?.target)
      ) {
        return err(new ConflictError('EMAIL_TAKEN', 'email is already registered'));
      }
      throw error;
    }
  }
}
