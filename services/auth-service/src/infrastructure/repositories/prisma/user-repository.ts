import { randomUUID } from 'node:crypto';

import { Prisma, type PrismaClient } from '@prisma/client';

import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { asPasswordHash } from '../../../domain/password.js';
import { asUserId } from '../../../domain/user.js';
import type { User, UserRegistered } from '../../../domain/user.js';
import type { EmailTakenError, UserRepository } from '../../../domain/user-repository.js';
import { correlationIdForRegistration } from './registration-correlation.js';

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

  async save(user: User, registered: UserRegistered): Promise<Result<void, EmailTakenError>> {
    const correlationId = correlationIdForRegistration();
    try {
      await this.prisma.$transaction([
        this.prisma.user.create({
          data: {
            id: user.id,
            name: user.name,
            email: user.email,
            passwordHash: user.passwordHash,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
        }),
        this.prisma.outboxEvent.create({
          data: {
            id: randomUUID(),
            aggregateType: 'User',
            aggregateId: user.id,
            eventType: 'user.registered',
            version: 1,
            payload: { ...registered },
            correlationId,
            occurredAt: user.createdAt,
          },
        }),
      ]);
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
