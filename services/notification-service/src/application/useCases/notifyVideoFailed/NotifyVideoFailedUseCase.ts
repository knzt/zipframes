import { randomUUID } from 'node:crypto';

import { Notification } from '../../../domain/entities/notification.js';
import type { NotificationRepository } from '../../interfaces/repositories/NotificationRepository.js';
import type { SendNotificationEmailUseCase } from '../sendNotificationEmail/SendNotificationEmailUseCase.js';

export interface NotifyVideoFailedInput {
  readonly videoId: string;
  readonly ownerId: string;
  readonly originalFileName?: string;
  readonly reason: string;
  readonly uploadedAt?: Date;
}

export class NotifyVideoFailedUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly sendNotificationEmail: SendNotificationEmailUseCase,
  ) {}

  async execute(input: NotifyVideoFailedInput): Promise<Notification> {
    const existing = await this.notifications.findByVideoIdAndType(input.videoId, 'VIDEO_FAILED');
    if (existing !== null) {
      if (existing.isTerminal()) {
        return existing;
      }
      return this.sendNotificationEmail.execute(existing);
    }

    const created = await this.notifications.save(
      Notification.create({
        id: randomUUID(),
        userId: input.ownerId,
        videoId: input.videoId,
        type: 'VIDEO_FAILED',
        originalFileName: input.originalFileName ?? 'video',
        failureReason: input.reason,
        ...(input.uploadedAt === undefined ? {} : { uploadedAt: input.uploadedAt }),
        createdAt: new Date(),
      }),
    );
    return this.sendNotificationEmail.execute(created);
  }
}
