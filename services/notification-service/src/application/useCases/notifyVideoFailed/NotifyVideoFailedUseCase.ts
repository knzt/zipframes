import { randomUUID } from 'node:crypto';

import { Notification } from '../../../domain/entities/notification.js';
import type { NotificationRepository } from '../../interfaces/repositories/NotificationRepository.js';
import type { DispatchNotificationUseCase } from '../dispatchNotification/DispatchNotificationUseCase.js';

export interface NotifyVideoFailedInput {
  readonly videoId: string;
  readonly ownerId: string;
  readonly originalFileName?: string;
  readonly reason: string;
}

export class NotifyVideoFailedUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly dispatch: DispatchNotificationUseCase,
  ) {}

  async execute(input: NotifyVideoFailedInput): Promise<Notification> {
    const existing = await this.notifications.findByVideoIdAndType(input.videoId, 'VIDEO_FAILED');
    if (existing !== null) {
      if (existing.isTerminal()) {
        return existing;
      }
      return this.dispatch.execute(existing);
    }

    const created = await this.notifications.save(
      Notification.create({
        id: randomUUID(),
        userId: input.ownerId,
        videoId: input.videoId,
        type: 'VIDEO_FAILED',
        originalFileName: input.originalFileName ?? 'video',
        failureReason: input.reason,
        createdAt: new Date(),
      }),
    );
    return this.dispatch.execute(created);
  }
}
