import { Contact } from '../../../domain/entities/contact.js';
import type { ContactRepository } from '../../interfaces/repositories/ContactRepository.js';
import type { NotificationRepository } from '../../interfaces/repositories/NotificationRepository.js';
import type { DispatchNotificationUseCase } from '../dispatchNotification/DispatchNotificationUseCase.js';

export interface UpsertContactInput {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly occurredAt: Date;
}

export class UpsertContactUseCase {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly notifications: NotificationRepository,
    private readonly dispatch: DispatchNotificationUseCase,
  ) {}

  async execute(input: UpsertContactInput): Promise<Contact> {
    const existing = await this.contacts.findByUserId(input.userId);
    const next =
      existing === null
        ? Contact.create({
            userId: input.userId,
            name: input.name,
            email: input.email,
            updatedAt: input.occurredAt,
          })
        : existing.applyUpdate({
            name: input.name,
            email: input.email,
            updatedAt: input.occurredAt,
          });

    if (existing !== null && next === existing) {
      return existing;
    }

    const saved = await this.contacts.upsert(next);
    const pending = await this.notifications.findPendingByUserId(saved.userId);
    for (const notification of pending) {
      await this.dispatch.execute(notification);
    }
    return saved;
  }
}
