import type { Contact } from '../../src/domain/entities/contact.js';
import type { Notification } from '../../src/domain/entities/notification.js';
import type { NotificationType } from '../../src/domain/entities/notification.js';
import type { ContactRepository } from '../../src/application/interfaces/repositories/ContactRepository.js';
import type { NotificationRepository } from '../../src/application/interfaces/repositories/NotificationRepository.js';
import type {
  MailGateway,
  MailMessage,
} from '../../src/application/interfaces/gateways/MailGateway.js';
import type {
  ObjectStorage,
  SignGetUrlInput,
} from '../../src/application/interfaces/gateways/ObjectStorage.js';

export class InMemoryContactRepository implements ContactRepository {
  readonly rows = new Map<string, Contact>();

  findByUserId(userId: string): Promise<Contact | null> {
    return Promise.resolve(this.rows.get(userId) ?? null);
  }

  upsert(contact: Contact): Promise<Contact> {
    this.rows.set(contact.userId, contact);
    return Promise.resolve(contact);
  }

  deleteByUserId(userId: string): Promise<void> {
    this.rows.delete(userId);
    return Promise.resolve();
  }
}

export class InMemoryNotificationRepository implements NotificationRepository {
  readonly rows: Notification[] = [];

  findByVideoIdAndType(videoId: string, type: NotificationType): Promise<Notification | null> {
    return Promise.resolve(
      this.rows.find((row) => row.videoId === videoId && row.type === type) ?? null,
    );
  }

  save(notification: Notification): Promise<Notification> {
    const index = this.rows.findIndex((row) => row.id === notification.id);
    if (index === -1) {
      const clash = this.rows.find(
        (row) => row.videoId === notification.videoId && row.type === notification.type,
      );
      if (clash) {
        return Promise.resolve(clash);
      }
      this.rows.push(notification);
    } else {
      this.rows[index] = notification;
    }
    return Promise.resolve(notification);
  }

  findPendingByUserId(userId: string): Promise<readonly Notification[]> {
    return Promise.resolve(
      this.rows.filter((row) => row.userId === userId && row.status === 'PENDING'),
    );
  }

  deleteByUserId(userId: string): Promise<void> {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (this.rows[index]?.userId === userId) {
        this.rows.splice(index, 1);
      }
    }
    return Promise.resolve();
  }
}

export class RecordingMailGateway implements MailGateway {
  readonly sent: MailMessage[] = [];
  failTimes = 0;

  send(message: MailMessage): Promise<void> {
    if (this.failTimes > 0) {
      this.failTimes -= 1;
      return Promise.reject(new Error('smtp down'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}

export class StubObjectStorage implements ObjectStorage {
  constructor(private readonly url = 'https://storage.example/signed') {}

  signGetUrl(_input: SignGetUrlInput): Promise<string> {
    return Promise.resolve(this.url);
  }
}
