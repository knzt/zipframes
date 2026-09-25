import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

import { PrismaClient } from '@prisma/client';
import { startPostgres } from '@zipframes/test-toolkit';
import type { PostgresHandle } from '@zipframes/test-toolkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerUser, type User } from '../../src/domain/entities/user.js';
import { userRegisteredFrom } from '../../src/domain/events/userRegistered.js';
import { asPasswordHash } from '../../src/domain/valueObjects/password.js';
import { PrismaEventOutbox } from '../../src/infrastructure/gateways/prismaEventOutbox.gateway.js';
import { PrismaUnitOfWork } from '../../src/infrastructure/repositories/prisma/prismaUnitOfWork.js';
import { PrismaUserRepository } from '../../src/infrastructure/repositories/prisma/user.repository.js';

const execFileAsync = promisify(execFile);

const passwordHash = asPasswordHash('p'.repeat(60));

const buildUser = (email: string): User => {
  const user = registerUser({
    id: randomUUID(),
    name: 'Ada Lovelace',
    email,
    passwordHash,
    now: new Date('2026-01-01T12:00:00.000Z'),
  });
  if (!user.ok) {
    throw new Error(user.error.message);
  }
  return user.value;
};

describe('user save and EventOutbox record share a Postgres transaction', () => {
  let postgres: PostgresHandle;
  let prisma: PrismaClient;

  beforeAll(async () => {
    postgres = await startPostgres();
    const serviceRoot = path.resolve(import.meta.dirname, '../../');
    await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: serviceRoot,
      env: { ...process.env, AUTH_DATABASE_URL: postgres.connectionUri },
    });
    prisma = new PrismaClient({ datasources: { db: { url: postgres.connectionUri } } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await postgres.stop();
  });

  it('commits the user and the outbox row together', async () => {
    const user = buildUser('ada@example.com');
    const uow = new PrismaUnitOfWork(prisma);
    const users = new PrismaUserRepository(prisma);
    const eventOutbox = new PrismaEventOutbox(
      prisma,
      { next: () => '44444444-4444-4444-8444-444444444444' },
      { now: () => new Date('2026-01-01T12:00:00.000Z') },
    );

    await uow.run(async () => {
      const saved = await users.save(user);
      if (!saved.ok) {
        throw new Error('expected save to succeed');
      }
      await eventOutbox.record(userRegisteredFrom(user), '33333333-3333-4333-8333-333333333333');
    });

    const storedUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(storedUser.email).toBe('ada@example.com');
    const outbox = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: '44444444-4444-4444-8444-444444444444' },
    });
    expect(outbox).toMatchObject({
      aggregateType: 'User',
      aggregateId: user.id,
      eventType: 'user.registered',
      version: 1,
      correlationId: '33333333-3333-4333-8333-333333333333',
      payload: {
        userId: user.id,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    });
    expect(outbox.publishedAt).toBeNull();
  });

  it('rolls back the user when the outbox write fails', async () => {
    const user = buildUser('rolled-back@example.com');
    const uow = new PrismaUnitOfWork(prisma);
    const users = new PrismaUserRepository(prisma);

    await expect(
      uow.run(async () => {
        const saved = await users.save(user);
        if (!saved.ok) {
          throw new Error('expected save to succeed');
        }
        throw new Error('outbox failed');
      }),
    ).rejects.toThrow('outbox failed');

    expect(
      await prisma.user.findUnique({ where: { email: 'rolled-back@example.com' } }),
    ).toBeNull();
    expect(await prisma.outboxEvent.count({ where: { aggregateId: user.id } })).toBe(0);
  });

  it('does not keep a half-written registration when the email is taken', async () => {
    const first = buildUser('taken@example.com');
    const second = buildUser('taken@example.com');
    const uow = new PrismaUnitOfWork(prisma);
    const users = new PrismaUserRepository(prisma);
    const eventOutbox = new PrismaEventOutbox(
      prisma,
      { next: () => randomUUID() },
      { now: () => new Date() },
    );

    await uow.run(async () => {
      const saved = await users.save(first);
      if (!saved.ok) {
        throw new Error('expected first save to succeed');
      }
      await eventOutbox.record(userRegisteredFrom(first), randomUUID());
    });

    await expect(
      uow.run(async () => {
        await users.save(second);
        await eventOutbox.record(userRegisteredFrom(second), randomUUID());
      }),
    ).rejects.toMatchObject({ name: 'UserEmailTakenError' });

    expect(await prisma.user.count({ where: { email: 'taken@example.com' } })).toBe(1);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: second.id } })).toBe(0);
  });
});
