import { PrismaClient } from '@prisma/client';
import { startPostgres } from '@zipframes/test-toolkit';
import type { PostgresHandle } from '@zipframes/test-toolkit';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerUser } from '../../../../../src/domain/entities/user.js';
import { PrismaUserRepository } from '../../../../../src/infrastructure/repositories/prisma/user.repository.js';

const execFileAsync = promisify(execFile);

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '44444444-4444-4444-8444-444444444444';
const outboxId = '22222222-2222-4222-8222-222222222222';
const duplicateOutboxId = '55555555-5555-4555-8555-555555555555';
const correlationId = '33333333-3333-4333-8333-333333333333';
const email = 'ada@example.com';
const passwordHash = 'a'.repeat(60);
const now = new Date('2026-09-25T12:00:00.000Z');

describe('PrismaUserRepository', () => {
  let postgres: PostgresHandle;
  let prisma: PrismaClient;
  let repository: PrismaUserRepository;

  beforeAll(async () => {
    postgres = await startPostgres();
    const serviceRoot = path.resolve(import.meta.dirname, '../../../../../');
    await execFileAsync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: serviceRoot,
      env: { ...process.env, AUTH_DATABASE_URL: postgres.connectionUri },
    });
    prisma = new PrismaClient({ datasources: { db: { url: postgres.connectionUri } } });
    repository = new PrismaUserRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await postgres.stop();
  });

  it('persists a user and an outbox row in one transaction', async () => {
    const created = registerUser({
      id: userId,
      name: 'Ada Lovelace',
      email,
      passwordHash,
      now,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const saved = await repository.save(created.value, {
      id: outboxId,
      aggregateType: 'User',
      aggregateId: userId,
      eventType: 'user.registered',
      version: 1,
      payload: { userId, email },
      correlationId,
      occurredAt: now,
    });
    expect(saved.ok).toBe(true);

    const found = await repository.findByEmail(email);
    expect(found?.id).toBe(userId);
    expect(found?.email).toBe(email);

    const outbox = await prisma.outboxEvent.findUnique({ where: { id: outboxId } });
    expect(outbox?.aggregateId).toBe(userId);
    expect(outbox?.eventType).toBe('user.registered');
    expect(outbox?.correlationId).toBe(correlationId);

    const duplicateUser = registerUser({
      id: otherUserId,
      name: 'Ada Lovelace',
      email,
      passwordHash,
      now,
    });
    expect(duplicateUser.ok).toBe(true);
    if (!duplicateUser.ok) {
      return;
    }

    const duplicate = await repository.save(duplicateUser.value, {
      id: duplicateOutboxId,
      aggregateType: 'User',
      aggregateId: otherUserId,
      eventType: 'user.registered',
      version: 1,
      payload: { userId: otherUserId, email },
      correlationId,
      occurredAt: now,
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) {
      return;
    }
    expect(duplicate.error.code).toBe('EMAIL_TAKEN');
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.outboxEvent.findUnique({ where: { id: duplicateOutboxId } })).toBeNull();
    expect(await repository.findByEmail('missing@example.com')).toBeNull();
  });
});
