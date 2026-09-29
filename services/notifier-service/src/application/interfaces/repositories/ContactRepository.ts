import type { Contact } from '../../../domain/entities/contact.js';

export interface ContactRepository {
  findByUserId: (userId: string) => Promise<Contact | null>;
  upsert: (contact: Contact) => Promise<Contact>;
  deleteByUserId: (userId: string) => Promise<void>;
}
