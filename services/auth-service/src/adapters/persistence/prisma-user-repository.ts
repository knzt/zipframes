import { Prisma, type PrismaClient } from '@prisma/client';

// This adapter could not be typechecked against a generated Prisma Client
// in this environment: `prisma generate` needs to download an engine
// binary this sandbox has no network access to. The code follows Prisma
// Client's documented v6 API from memory; `error instanceof
// Prisma.PrismaClientKnownRequestError` is standard, correct narrowing
// that will typecheck cleanly the moment the client exists — verified
// against an identical pattern with a real class. Run
// `pnpm --filter @zipframes/auth-service db:generate` before trusting
// this file, and cover it with an integration test against a real
// Postgres per docs/architecture/layers.md's testing strategy.

import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { asPasswordHash } from '../../domain/password.js';
import { asUserId } from '../../domain/user.js';
import type { User } from '../../domain/user.js';
import type { EmailTakenError, OutboxEvent, UserRepository } from '../../application/ports/index.js';

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

  async saveWithEvent(user: User, event: OutboxEvent): Promise<Result<void, EmailTakenError>> {
    try {
      // Both writes commit together (ADR-0008): the outbox row must exist
      // if and only if the user row does, so the relay never publishes an
      // event for a user that was rolled back, and a broker outage never
      // loses the event for a user that was saved.
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
            id: event.id,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            version: event.version,
            payload: event.payload as Prisma.InputJsonValue,
            correlationId: event.correlationId,
            occurredAt: event.occurredAt,
          },
        }),
      ]);
      return ok(undefined);
    } catch (error) {
      // Uniqueness is enforced by the database, not by a prior read (see
      // the use case): this is where a concurrent duplicate registration
      // actually gets caught.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION) {
        return err({ code: 'EMAIL_TAKEN' as const });
      }
      throw error;
    }
  }
}
