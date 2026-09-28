import { PrismaNotificationRepository } from '../../../infrastructure/repositories/prisma/notification.repository.js';
import type { Prisma } from '../externals/prisma.js';

export const createNotificationRepository = (prisma: Prisma): PrismaNotificationRepository =>
  new PrismaNotificationRepository(prisma);
