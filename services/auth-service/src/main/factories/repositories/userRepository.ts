import { PrismaUserRepository } from '../../../infrastructure/repositories/prisma/user.repository.js';
import type { Prisma } from '../externals/prisma.js';

export const createUserRepository = (prisma: Prisma): PrismaUserRepository =>
  new PrismaUserRepository({ prisma });
