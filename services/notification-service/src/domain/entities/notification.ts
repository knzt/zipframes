import { NotificationAttempt } from './notificationAttempt.js';
import type { PersistedNotificationAttempt } from './notificationAttempt.js';

export const NOTIFICATION_TYPES = ['VIDEO_PROCESSED', 'VIDEO_FAILED'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['EMAIL'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const DEFAULT_MAX_DELIVERY_ATTEMPTS = 3;

export interface CreateNotificationProps {
  readonly id: string;
  readonly userId: string;
  readonly videoId: string;
  readonly type: NotificationType;
  readonly originalFileName: string;
  readonly failureReason?: string;
  readonly resultKey?: string;
  readonly frameCount?: number;
  readonly uploadedAt?: Date;
  readonly createdAt: Date;
}

export interface PersistedNotification {
  readonly id: string;
  readonly userId: string;
  readonly videoId: string;
  readonly type: NotificationType;
  readonly channel: NotificationChannel;
  readonly status: NotificationStatus;
  readonly target: string | null;
  readonly originalFileName: string;
  readonly failureReason: string | null;
  readonly resultKey: string | null;
  readonly frameCount: number | null;
  readonly uploadedAt: Date | null;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
  readonly attempts: readonly PersistedNotificationAttempt[];
}

interface NotificationState {
  readonly id: string;
  readonly userId: string;
  readonly videoId: string;
  readonly type: NotificationType;
  readonly channel: NotificationChannel;
  readonly status: NotificationStatus;
  readonly target: string | null;
  readonly originalFileName: string;
  readonly failureReason: string | null;
  readonly resultKey: string | null;
  readonly frameCount: number | null;
  readonly uploadedAt: Date | null;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
  readonly attempts: readonly NotificationAttempt[];
}

export interface FailedAttemptInput {
  readonly id: string;
  readonly target: string;
  readonly error: string;
  readonly attemptedAt: Date;
}

/**
 * One e-mail per video and type. Re-delivery is a no-op once SENT or FAILED.
 * Missing contact leaves the row PENDING until identity events drain it.
 */
export class Notification {
  private constructor(private readonly state: NotificationState) {}

  static create(props: CreateNotificationProps): Notification {
    return new Notification({
      id: props.id,
      userId: props.userId,
      videoId: props.videoId,
      type: props.type,
      channel: 'EMAIL',
      status: 'PENDING',
      target: null,
      originalFileName: props.originalFileName,
      failureReason: props.failureReason ?? null,
      resultKey: props.resultKey ?? null,
      frameCount: props.frameCount ?? null,
      uploadedAt: props.uploadedAt ?? null,
      createdAt: props.createdAt,
      sentAt: null,
      attempts: [],
    });
  }

  static fromPersistence(data: PersistedNotification): Notification {
    return new Notification({
      ...data,
      attempts: data.attempts.map((attempt) => NotificationAttempt.fromPersistence(attempt)),
    });
  }

  get id(): string {
    return this.state.id;
  }

  get userId(): string {
    return this.state.userId;
  }

  get videoId(): string {
    return this.state.videoId;
  }

  get type(): NotificationType {
    return this.state.type;
  }

  get channel(): NotificationChannel {
    return this.state.channel;
  }

  get status(): NotificationStatus {
    return this.state.status;
  }

  get target(): string | null {
    return this.state.target;
  }

  get originalFileName(): string {
    return this.state.originalFileName;
  }

  get failureReason(): string | null {
    return this.state.failureReason;
  }

  get resultKey(): string | null {
    return this.state.resultKey;
  }

  get frameCount(): number | null {
    return this.state.frameCount;
  }

  get uploadedAt(): Date | null {
    return this.state.uploadedAt;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get sentAt(): Date | null {
    return this.state.sentAt;
  }

  get attempts(): readonly NotificationAttempt[] {
    return this.state.attempts;
  }

  get failedAttemptCount(): number {
    return this.state.attempts.length;
  }

  isTerminal(): boolean {
    return this.state.status === 'SENT' || this.state.status === 'FAILED';
  }

  hasExhaustedAttempts(maxAttempts: number = DEFAULT_MAX_DELIVERY_ATTEMPTS): boolean {
    return this.failedAttemptCount >= maxAttempts;
  }

  markSent(target: string, sentAt: Date): Notification {
    return new Notification({
      ...this.state,
      status: 'SENT',
      target,
      sentAt,
    });
  }

  markFailed(): Notification {
    return new Notification({
      ...this.state,
      status: 'FAILED',
    });
  }

  recordFailedAttempt(input: FailedAttemptInput): Notification {
    const attempt = NotificationAttempt.create({
      id: input.id,
      notificationId: this.state.id,
      attempt: this.state.attempts.length + 1,
      target: input.target,
      error: input.error,
      attemptedAt: input.attemptedAt,
    });
    return new Notification({
      ...this.state,
      attempts: [...this.state.attempts, attempt],
    });
  }

  toJSON(): PersistedNotification {
    return {
      id: this.state.id,
      userId: this.state.userId,
      videoId: this.state.videoId,
      type: this.state.type,
      channel: this.state.channel,
      status: this.state.status,
      target: this.state.target,
      originalFileName: this.state.originalFileName,
      failureReason: this.state.failureReason,
      resultKey: this.state.resultKey,
      frameCount: this.state.frameCount,
      uploadedAt: this.state.uploadedAt,
      createdAt: this.state.createdAt,
      sentAt: this.state.sentAt,
      attempts: this.state.attempts.map((attempt) => attempt.toJSON()),
    };
  }
}
