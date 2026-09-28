import { randomUUID } from 'node:crypto';

import { Notification } from '../../../domain/entities/notification.js';
import type { NotificationRepository } from '../../interfaces/repositories/NotificationRepository.js';
import type { SendNotificationEmailUseCase } from '../sendNotificationEmail/SendNotificationEmailUseCase.js';

export interface NotifyVideoProcessedInput {
  readonly videoId: string;
  readonly ownerId?: string;
  readonly originalFileName?: string;
  readonly resultKey: string;
  readonly frameCount: number;
}

export class NotifyVideoProcessedUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly sendNotificationEmail: SendNotificationEmailUseCase,
  ) {}

  async execute(input: NotifyVideoProcessedInput): Promise<Notification | null> {
    if (input.ownerId === undefined) {
      return null;
    }

    const existing = await this.notifications.findByVideoIdAndType(
      input.videoId,
      'VIDEO_PROCESSED',
    );
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
        type: 'VIDEO_PROCESSED',
        originalFileName: input.originalFileName ?? 'video',
        resultKey: input.resultKey,
        frameCount: input.frameCount,
        createdAt: new Date(),
      }),
    );
    return this.sendNotificationEmail.execute(created);
  }
}
