import { describe, expect, it } from 'vitest';

import { NotificationAttempt } from '../../../../src/domain/entities/notificationAttempt.js';

describe('NotificationAttempt', () => {
  it('round-trips persistence', () => {
    const attempt = NotificationAttempt.create({
      id: '55555555-5555-4555-8555-555555555555',
      notificationId: '44444444-4444-4444-8444-444444444444',
      attempt: 2,
      target: 'ada@example.com',
      error: 'smtp down',
      attemptedAt: new Date('2026-09-28T12:01:00.000Z'),
    });

    const restored = NotificationAttempt.fromPersistence(attempt.toJSON());
    expect(restored.attempt).toBe(2);
    expect(restored.target).toBe('ada@example.com');
    expect(restored.error).toBe('smtp down');
    expect(restored.notificationId).toBe(attempt.notificationId);
  });
});
