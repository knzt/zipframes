import { AsyncLocalStorage } from 'node:async_hooks';

import type { Prisma, PrismaClient } from '@prisma/client';

const transactionStore = new AsyncLocalStorage<Prisma.TransactionClient>();

export type PrismaConnection = PrismaClient | Prisma.TransactionClient;

/**
 * The client of the Unit of Work transaction, or the process client when
 * nothing is running inside `runPrismaTransaction` (reads such as login).
 */
export const prismaConnection = (fallback: PrismaClient): PrismaConnection =>
  transactionStore.getStore() ?? fallback;

export const runPrismaTransaction = <T>(prisma: PrismaClient, work: () => Promise<T>): Promise<T> =>
  prisma.$transaction(async (tx) => transactionStore.run(tx, work));
