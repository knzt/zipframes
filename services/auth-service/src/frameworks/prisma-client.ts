import { PrismaClient } from '@prisma/client';

// Same caveat as prisma-user-repository.ts: unverified against a generated
// client in this environment, run `db:generate` first.

/**
 * One client per process, per Prisma's own guidance: it manages a
 * connection pool internally, and creating more than one defeats that.
 */
export const createPrismaClient = (): PrismaClient => new PrismaClient();
