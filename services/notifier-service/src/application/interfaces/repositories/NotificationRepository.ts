import type { Notification } from '../../../domain/entities/notification.js';
import type { NotificationType } from '../../../domain/entities/notification.js';

export interface NotificationRepository {
  findByVideoIdAndType: (videoId: string, type: NotificationType) => Promise<Notification | null>;
  save: (notification: Notification) => Promise<Notification>;
  findPendingByUserId: (userId: string) => Promise<readonly Notification[]>;
  deleteByUserId: (userId: string) => Promise<void>;
}
