import { PrismaClient } from '@prisma/client';
import type { Pingable } from '@zipframes/core';

/**
 * One client per process, per Prisma's own guidance: it manages a
 * connection pool internally, and creating more than one defeats that.
 */
export const createPrismaClient = (databaseUrl: string): PrismaClient =>
  new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

export const pingDatabase = async (prisma: PrismaClient): Promise<void> => {
  await prisma.$queryRaw`SELECT 1`;
};

export const createPrismaPing = (prisma: PrismaClient): Pingable => ({
  ping: () => pingDatabase(prisma),
});
