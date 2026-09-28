import { Prisma, type PrismaClient } from '@prisma/client';

import type { NotificationRepository } from '../../../application/interfaces/repositories/NotificationRepository.js';
import {
  Notification,
  type NotificationType,
  type PersistedNotification,
} from '../../../domain/entities/notification.js';

const UNIQUE_VIOLATION = 'P2002';

const toDomain = (row: {
  readonly id: string;
  readonly userId: string;
  readonly videoId: string;
  readonly type: NotificationType;
  readonly channel: PersistedNotification['channel'];
  readonly status: PersistedNotification['status'];
  readonly target: string | null;
  readonly originalFileName: string;
  readonly failureReason: string | null;
  readonly resultKey: string | null;
  readonly frameCount: number | null;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
  readonly attempts: readonly PersistedNotification['attempts'][number][];
}): Notification => Notification.fromPersistence(row);

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByVideoIdAndType(
    videoId: string,
    type: NotificationType,
  ): Promise<Notification | null> {
    const row = await this.prisma.notification.findUnique({
      where: { videoId_type: { videoId, type } },
      include: { attempts: { orderBy: { attempt: 'asc' } } },
    });
    return row === null ? null : toDomain(row);
  }

  async save(notification: Notification): Promise<Notification> {
    const data = notification.toJSON();
    try {
      const existing = await this.prisma.notification.findUnique({
        where: { id: data.id },
        select: { id: true },
      });
      if (existing === null) {
        const row = await this.prisma.notification.create({
          data: {
            id: data.id,
            userId: data.userId,
            videoId: data.videoId,
            type: data.type,
            channel: data.channel,
            status: data.status,
            target: data.target,
            originalFileName: data.originalFileName,
            failureReason: data.failureReason,
            resultKey: data.resultKey,
            frameCount: data.frameCount,
            createdAt: data.createdAt,
            sentAt: data.sentAt,
            attempts: {
              create: data.attempts.map((attempt) => ({
                id: attempt.id,
                attempt: attempt.attempt,
                target: attempt.target,
                error: attempt.error,
                attemptedAt: attempt.attemptedAt,
              })),
            },
          },
          include: { attempts: { orderBy: { attempt: 'asc' } } },
        });
        return toDomain(row);
      }

      const persistedAttempts = await this.prisma.notificationAttempt.findMany({
        where: { notificationId: data.id },
        select: { id: true },
      });
      const known = new Set(persistedAttempts.map((row) => row.id));
      const newAttempts = data.attempts.filter((attempt) => !known.has(attempt.id));

      const row = await this.prisma.notification.update({
        where: { id: data.id },
        data: {
          status: data.status,
          target: data.target,
          sentAt: data.sentAt,
          attempts: {
            create: newAttempts.map((attempt) => ({
              id: attempt.id,
              attempt: attempt.attempt,
              target: attempt.target,
              error: attempt.error,
              attemptedAt: attempt.attemptedAt,
            })),
          },
        },
        include: { attempts: { orderBy: { attempt: 'asc' } } },
      });
      return toDomain(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        const existing = await this.findByVideoIdAndType(data.videoId, data.type);
        if (existing !== null) {
          return existing;
        }
      }
      throw error;
    }
  }

  async findPendingByUserId(userId: string): Promise<readonly Notification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId, status: 'PENDING' },
      include: { attempts: { orderBy: { attempt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDomain);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.notification.deleteMany({ where: { userId } });
  }
}
