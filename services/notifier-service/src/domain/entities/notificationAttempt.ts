export interface CreateNotificationAttemptProps {
  readonly id: string;
  readonly notificationId: string;
  readonly attempt: number;
  readonly target: string;
  readonly error: string;
  readonly attemptedAt: Date;
}

export interface PersistedNotificationAttempt {
  readonly id: string;
  readonly notificationId: string;
  readonly attempt: number;
  readonly target: string;
  readonly error: string;
  readonly attemptedAt: Date;
}

/**
 * A failed SMTP send. Successful deliveries live on {@link Notification}
 * (`SENT`, `sentAt`, `target`) and never become a row here.
 */
export class NotificationAttempt {
  private constructor(private readonly state: PersistedNotificationAttempt) {}

  static create(props: CreateNotificationAttemptProps): NotificationAttempt {
    return new NotificationAttempt(props);
  }

  static fromPersistence(data: PersistedNotificationAttempt): NotificationAttempt {
    return new NotificationAttempt(data);
  }

  get id(): string {
    return this.state.id;
  }

  get notificationId(): string {
    return this.state.notificationId;
  }

  get attempt(): number {
    return this.state.attempt;
  }

  get target(): string {
    return this.state.target;
  }

  get error(): string {
    return this.state.error;
  }

  get attemptedAt(): Date {
    return this.state.attemptedAt;
  }

  toJSON(): PersistedNotificationAttempt {
    return { ...this.state };
  }
}
