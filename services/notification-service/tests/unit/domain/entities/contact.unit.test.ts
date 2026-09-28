import { describe, expect, it } from 'vitest';

import { Contact } from '../../../../src/domain/entities/contact.js';

const userId = '33333333-3333-4333-8333-333333333333';

describe('Contact', () => {
  it('discards an update older than the stored identity', () => {
    const contact = Contact.create({
      userId,
      name: 'Ada',
      email: 'ada@example.com',
      updatedAt: new Date('2026-09-28T12:00:00.000Z'),
    });

    const stale = contact.applyUpdate({
      name: 'Old',
      email: 'old@example.com',
      updatedAt: new Date('2026-09-28T11:00:00.000Z'),
    });

    expect(stale).toBe(contact);
    expect(stale.email).toBe('ada@example.com');
  });

  it('applies a newer identity event', () => {
    const contact = Contact.create({
      userId,
      name: 'Ada',
      email: 'ada@example.com',
      updatedAt: new Date('2026-09-28T12:00:00.000Z'),
    });

    const next = contact.applyUpdate({
      name: 'Ada Lovelace',
      email: 'ada@new.example',
      updatedAt: new Date('2026-09-28T13:00:00.000Z'),
    });

    expect(next.email).toBe('ada@new.example');
    expect(next.name).toBe('Ada Lovelace');
    expect(next.toJSON().userId).toBe(userId);

    const restored = Contact.fromPersistence(next.toJSON());
    expect(restored.userId).toBe(userId);
    expect(restored.updatedAt.toISOString()).toBe('2026-09-28T13:00:00.000Z');
    expect(restored.toJSON()).toEqual(next.toJSON());
  });
});
