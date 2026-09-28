import { PrismaVideoRepository } from '../../../infrastructure/repositories/prisma/video.repository.js';
import type { Prisma } from '../externals/prisma.js';

export const createVideoRepository = (prisma: Prisma): PrismaVideoRepository =>
  new PrismaVideoRepository(prisma);
