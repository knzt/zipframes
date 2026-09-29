import { Contact } from '../../../domain/entities/contact.js';
import type { ContactRepository } from '../../interfaces/repositories/ContactRepository.js';
import type { NotificationRepository } from '../../interfaces/repositories/NotificationRepository.js';
import type { SendNotificationEmailUseCase } from '../sendNotificationEmail/SendNotificationEmailUseCase.js';

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
    private readonly sendNotificationEmail: SendNotificationEmailUseCase,
  ) {}

  async execute(input: UpsertContactInput): Promise<Contact> {
    const existing = await this.contacts.findByUserId(input.userId);
    const updatedContact =
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

    if (existing !== null && updatedContact === existing) {
      return existing;
    }

    const saved = await this.contacts.upsert(updatedContact);
    const pending = await this.notifications.findPendingByUserId(saved.userId);
    for (const notification of pending) {
      await this.sendNotificationEmail.execute(notification);
    }
    return saved;
  }
}
