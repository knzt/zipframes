import { PrismaClient } from '@prisma/client';

/**
 * One client per process, per Prisma's own guidance: it manages a
 * connection pool internally, and creating more than one defeats that.
 */
export const createPrismaClient = (): PrismaClient => new PrismaClient();

export const pingDatabase = async (prisma: PrismaClient): Promise<void> => {
  await prisma.$queryRaw`SELECT 1`;
};
