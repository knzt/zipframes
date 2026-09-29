import type { ContactRepository } from '../../interfaces/repositories/ContactRepository.js';
import type { NotificationRepository } from '../../interfaces/repositories/NotificationRepository.js';

export class DeleteContactUseCase {
  constructor(
    private readonly contacts: ContactRepository,
    private readonly notifications: NotificationRepository,
  ) {}

  async execute(userId: string): Promise<void> {
    await this.notifications.deleteByUserId(userId);
    await this.contacts.deleteByUserId(userId);
  }
}
