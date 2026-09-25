import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';

import { PrismaClient } from '@prisma/client';
import type { Publisher } from '@zipframes/communication';
import type { EventEnvelope } from '@zipframes/schemas';
import { startPostgres } from '@zipframes/test-toolkit';
import type { PostgresHandle } from '@zipframes/test-toolkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaOutboxRelayPersistence } from '../../src/infrastructure/repositories/prisma/outboxRelayPersistence.js';
import { createOutboxRelay } from '../../src/infrastructure/messaging/outboxRelay.js';

const execFileAsync = promisify(execFile);

const insertPendingRow = async (prisma: PrismaClient, id: string): Promise<void> => {
  await prisma.outboxEvent.create({
    data: {
      id,
      aggregateType: 'user',
      aggregateId: randomUUID(),
      eventType: 'user.registered',
      version: 1,
      payload: {
        userId: randomUUID(),
        name: 'Hellen Santos',
        email: 'hellen@example.com',
      },
      correlationId: randomUUID(),
      occurredAt: new Date('2026-01-01T12:00:00.000Z'),
    },
  });
};

describe('outbox relay', () => {
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

  it('publishes a pending row once and marks it published', async () => {
    const id = randomUUID();
    await insertPendingRow(prisma, id);
    const published: EventEnvelope<unknown>[] = [];
    const publisher: Publisher = {
      publish: (envelope) => {
        published.push(envelope);
        return Promise.resolve();
      },
    };

    const relay = createOutboxRelay({
      persistence: createPrismaOutboxRelayPersistence(prisma),
      publisher,
      maxAttempts: 5,
    });

    await expect(relay.runOnce()).resolves.toBe(1);
    await expect(relay.runOnce()).resolves.toBe(0);

    expect(published).toHaveLength(1);
    const envelope = published[0];
    expect(envelope).toMatchObject({
      eventId: id,
      eventType: 'user.registered',
      version: 1,
    });
    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(row.publishedAt).not.toBeNull();
    expect(row.attempts).toBe(0);
  });

  it('increments attempts and stops claiming a row once it is exhausted', async () => {
    const id = randomUUID();
    await insertPendingRow(prisma, id);
    const exhausted: string[] = [];
    const publisher: Publisher = {
      publish: () => Promise.reject(new Error('broker down')),
    };

    const relay = createOutboxRelay({
      persistence: createPrismaOutboxRelayPersistence(prisma),
      publisher,
      maxAttempts: 1,
      onExhausted: (row) => {
        exhausted.push(row.id);
      },
    });

    await expect(relay.runOnce()).resolves.toBe(0);

    const row = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(row.publishedAt).toBeNull();
    expect(row.attempts).toBe(1);
    expect(exhausted).toEqual([id]);

    await expect(relay.runOnce()).resolves.toBe(0);
    const again = await prisma.outboxEvent.findUniqueOrThrow({ where: { id } });
    expect(again.attempts).toBe(1);
  });
});
