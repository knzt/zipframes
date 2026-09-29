import type { PrismaClient } from '@prisma/client';

import type { ContactRepository } from '../../../application/interfaces/repositories/ContactRepository.js';
import { Contact } from '../../../domain/entities/contact.js';

export class PrismaContactRepository implements ContactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserId(userId: string): Promise<Contact | null> {
    const row = await this.prisma.contact.findUnique({ where: { userId } });
    return row === null ? null : Contact.fromPersistence(row);
  }

  async upsert(contact: Contact): Promise<Contact> {
    const data = contact.toJSON();
    const row = await this.prisma.contact.upsert({
      where: { userId: data.userId },
      create: data,
      update: {
        name: data.name,
        email: data.email,
        updatedAt: data.updatedAt,
      },
    });
    return Contact.fromPersistence(row);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.contact.deleteMany({ where: { userId } });
  }
}
