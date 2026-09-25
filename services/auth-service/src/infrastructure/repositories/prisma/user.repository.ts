import { Prisma, type PrismaClient } from '@prisma/client';

import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import type {
  UserRepository,
  UserRepositoryEmailTakenError,
} from '../../../application/interfaces/repositories/UserRepository.js';
import { asUserId } from '../../../domain/entities/user.js';
import type { User } from '../../../domain/entities/user.js';
import { asPasswordHash } from '../../../domain/valueObjects/password.js';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

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

  async save(user: User): Promise<Result<void, UserRepositoryEmailTakenError>> {
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
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        return err({ code: 'EMAIL_TAKEN' as const });
      }
      throw error;
    }
  }
}
