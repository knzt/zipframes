import { Prisma, type PrismaClient } from '@prisma/client';

import { ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import {
  UserEmailTakenError,
  type UserRepository,
  type UserRepositoryEmailTakenError,
} from '../../../application/interfaces/repositories/UserRepository.js';
import { asUserId } from '../../../domain/entities/user.js';
import type { User } from '../../../domain/entities/user.js';
import { asPasswordHash } from '../../../domain/valueObjects/password.js';
import { prismaConnection } from './prismaTransaction.js';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

const uniqueTargetFields = (error: Prisma.PrismaClientKnownRequestError): readonly string[] => {
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.filter((field): field is string => typeof field === 'string');
  }
  if (typeof target === 'string') {
    return [target];
  }
  return [];
};

/**
 * Only the users.email unique constraint means the address is taken.
 * A collision on users.id is a different failure and must not be reported
 * as a registration conflict.
 */
const isEmailUniqueViolation = (error: Prisma.PrismaClientKnownRequestError): boolean =>
  uniqueTargetFields(error).some((field) => field === 'email' || field.endsWith('_email_key'));

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
    const row = await prismaConnection(this.prisma).user.findUnique({ where: { email } });
    return row === null ? null : toDomain(row);
  }

  async save(user: User): Promise<Result<void, UserRepositoryEmailTakenError>> {
    try {
      await prismaConnection(this.prisma).user.create({
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
        isEmailUniqueViolation(error)
      ) {
        // The interactive transaction is already aborted. Returning Result
        // would try to commit it; the use case maps this error to EMAIL_TAKEN.
        throw new UserEmailTakenError();
      }
      throw error;
    }
  }
}
