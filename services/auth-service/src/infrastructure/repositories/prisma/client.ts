import type { PrismaClient } from '@prisma/client';
import type { Pingable } from '@zipframes/core';

export const pingDatabase = async (prisma: PrismaClient): Promise<void> => {
  await prisma.$queryRaw`SELECT 1`;
};

export const createPrismaPing = (prisma: PrismaClient): Pingable => ({
  ping: () => pingDatabase(prisma),
});
