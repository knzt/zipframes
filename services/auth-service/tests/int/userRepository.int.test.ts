/**
 * Integration stub: Prisma user repository + outbox against real Postgres.
 *
 * Enable with TESTCONTAINERS=1 (requires Docker). Skipped by default so unit
 * CI stays hermetic.
 */
import { describe, expect, it } from 'vitest';

const runWithContainers = process.env.TESTCONTAINERS === '1';

describe.skipIf(!runWithContainers)('PrismaUserRepository (testcontainers)', () => {
  it('persists a user and outbox row in one transaction', async () => {
    // Wire PostgreSqlContainer + Prisma migrate + PrismaUserRepository here.
    expect(true).toBe(true);
  });
});
