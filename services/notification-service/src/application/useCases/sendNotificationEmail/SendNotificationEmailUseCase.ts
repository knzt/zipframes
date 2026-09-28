import { randomUUID } from 'node:crypto';

import { UnavailableError } from '@zipframes/core';

import type { MailGateway } from '../../interfaces/gateways/MailGateway.js';
import type { ObjectStorage } from '../../interfaces/gateways/ObjectStorage.js';
import type { ContactRepository } from '../../interfaces/repositories/ContactRepository.js';
import type { NotificationRepository } from '../../interfaces/repositories/NotificationRepository.js';
import {
  DEFAULT_MAX_DELIVERY_ATTEMPTS,
  downloadFallbackUrl,
  failedMail,
  processedMail,
  uploadRetryUrl,
  type Notification,
} from '../../../domain/index.js';

export class SendNotificationEmailUseCase {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly contacts: ContactRepository,
    private readonly mail: MailGateway,
    private readonly objectStorage: ObjectStorage,
    private readonly appPublicUrl: string,
    private readonly downloadTtlSeconds: number,
    private readonly maxAttempts: number = DEFAULT_MAX_DELIVERY_ATTEMPTS,
  ) {}

  async execute(notification: Notification): Promise<Notification> {
    if (notification.isTerminal()) {
      return notification;
    }

    if (notification.hasExhaustedAttempts(this.maxAttempts)) {
      const failed = notification.markFailed();
      return this.notifications.save(failed);
    }

    const contact = await this.contacts.findByUserId(notification.userId);
    if (contact === null) {
      return notification;
    }

    const mail = await this.buildMail(notification);
    try {
      await this.mail.send({ to: contact.email, subject: mail.subject, text: mail.text });
      return await this.notifications.save(notification.markSent(contact.email, new Date()));
    } catch (error) {
      const failedAttempt = notification.recordFailedAttempt({
        id: randomUUID(),
        target: contact.email,
        error: error instanceof Error ? error.message : 'smtp send failed',
        attemptedAt: new Date(),
      });
      const notificationAfterFailedAttempt = failedAttempt.hasExhaustedAttempts(this.maxAttempts)
        ? failedAttempt.markFailed()
        : failedAttempt;
      await this.notifications.save(notificationAfterFailedAttempt);
      if (notificationAfterFailedAttempt.status === 'FAILED') {
        return notificationAfterFailedAttempt;
      }
      throw new UnavailableError('SMTP_SEND_FAILED', 'failed to send notification e-mail', {
        cause: error,
      });
    }
  }

  private async buildMail(
    notification: Notification,
  ): Promise<{ readonly subject: string; readonly text: string }> {
    if (notification.type === 'VIDEO_FAILED') {
      return failedMail({
        originalFileName: notification.originalFileName,
        retryUrl: uploadRetryUrl(this.appPublicUrl),
        ...(notification.uploadedAt === null ? {} : { uploadedAt: notification.uploadedAt }),
      });
    }

    const resultKey = notification.resultKey;
    if (resultKey === null) {
      throw new UnavailableError('RESULT_KEY_MISSING', 'processed notification has no result key');
    }

    const signedUrl = await this.objectStorage.signGetUrl({
      key: resultKey,
      expiresInSeconds: this.downloadTtlSeconds,
      downloadFileName: zipFileName(notification.originalFileName),
    });
    return processedMail({
      originalFileName: notification.originalFileName,
      frameCount: notification.frameCount ?? 0,
      signedUrl,
      fallbackUrl: downloadFallbackUrl(this.appPublicUrl, notification.videoId),
    });
  }
}

const zipFileName = (originalFileName: string): string => {
  const base = originalFileName.replace(/\.[^.]+$/u, '');
  return `${base || originalFileName}.zip`;
};
