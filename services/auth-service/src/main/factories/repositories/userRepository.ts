import type { PrismaClient } from '@prisma/client';

import { PrismaUserRepository } from '../../../infrastructure/repositories/prisma/user.repository.js';

export const createUserRepository = (prisma: PrismaClient): PrismaUserRepository =>
  new PrismaUserRepository(prisma);
