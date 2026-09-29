import { PrismaClient } from '@prisma/client';
import type { Pingable } from '@zipframes/core';

export const createPrisma = (databaseUrl: string): PrismaClient =>
  new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });

export type Prisma = ReturnType<typeof createPrisma>;

export const createPrismaPing = (prisma: Prisma): Pingable => ({
  ping: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
});
