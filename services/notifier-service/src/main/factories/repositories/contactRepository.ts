import { PrismaContactRepository } from '../../../infrastructure/repositories/prisma/contact.repository.js';
import type { Prisma } from '../externals/prisma.js';

export const createContactRepository = (prisma: Prisma): PrismaContactRepository =>
  new PrismaContactRepository(prisma);
