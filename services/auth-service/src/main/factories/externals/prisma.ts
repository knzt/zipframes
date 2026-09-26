import { PrismaClient } from '@prisma/client';

export const createPrisma = (databaseUrl: string): PrismaClient =>
  new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
