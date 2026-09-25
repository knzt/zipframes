import type { PrismaClient } from '@prisma/client';

import type { UnitOfWork } from '../../../application/interfaces/services/UnitOfWork.js';
import { runPrismaTransaction } from './prismaTransaction.js';

export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaClient) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return runPrismaTransaction(this.prisma, work);
  }
}
