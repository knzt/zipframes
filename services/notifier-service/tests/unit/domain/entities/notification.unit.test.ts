import { describe, expect, it } from 'vitest';

import { Notification } from '../../../../src/domain/entities/notification.js';

const videoId = '11111111-1111-4111-8111-111111111111';
const userId = '33333333-3333-4333-8333-333333333333';

describe('Notification', () => {
  it('starts PENDING and records only failed SMTP attempts', () => {
    const notification = Notification.create({
      id: '44444444-4444-4444-8444-444444444444',
      userId,
      videoId,
      type: 'VIDEO_PROCESSED',
      originalFileName: 'demo.mp4',
      resultKey: 'outputs/user/video.zip',
      frameCount: 10,
      createdAt: new Date('2026-09-28T12:00:00.000Z'),
    });

    expect(notification.status).toBe('PENDING');
    expect(notification.failedAttemptCount).toBe(0);

    const afterFail = notification.recordFailedAttempt({
      id: '55555555-5555-4555-8555-555555555555',
      target: 'ada@example.com',
      error: 'smtp down',
      attemptedAt: new Date('2026-09-28T12:01:00.000Z'),
    });
    expect(afterFail.failedAttemptCount).toBe(1);
    expect(afterFail.status).toBe('PENDING');
    expect(afterFail.hasExhaustedAttempts(3)).toBe(false);

    const sent = afterFail.markSent('ada@example.com', new Date('2026-09-28T12:02:00.000Z'));
    expect(sent.status).toBe('SENT');
    expect(sent.isTerminal()).toBe(true);
    expect(sent.target).toBe('ada@example.com');
  });

  it('marks FAILED after the configured attempt budget', () => {
    let notification = Notification.create({
      id: '44444444-4444-4444-8444-444444444444',
      userId,
      videoId,
      type: 'VIDEO_FAILED',
      originalFileName: 'demo.mp4',
      uploadedAt: new Date('2026-09-22T12:00:00.000Z'),
      createdAt: new Date('2026-09-28T12:00:00.000Z'),
    });
    expect(notification.uploadedAt?.toISOString()).toBe('2026-09-22T12:00:00.000Z');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      notification = notification.recordFailedAttempt({
        id: `55555555-5555-4555-8555-55555555555${String(attempt)}`,
        target: 'ada@example.com',
        error: 'smtp down',
        attemptedAt: new Date(),
      });
    }
    expect(notification.hasExhaustedAttempts(3)).toBe(true);
    expect(notification.markFailed().status).toBe('FAILED');
  });

  it('round-trips through persistence including attempts', () => {
    const created = Notification.create({
      id: '44444444-4444-4444-8444-444444444444',
      userId,
      videoId,
      type: 'VIDEO_PROCESSED',
      originalFileName: 'demo.mp4',
      resultKey: 'outputs/user/video.zip',
      frameCount: 10,
      createdAt: new Date('2026-09-28T12:00:00.000Z'),
    }).recordFailedAttempt({
      id: '55555555-5555-4555-8555-555555555555',
      target: 'ada@example.com',
      error: 'smtp down',
      attemptedAt: new Date('2026-09-28T12:01:00.000Z'),
    });
    const restored = Notification.fromPersistence(created.toJSON());
    expect(restored.id).toBe(created.id);
    expect(restored.userId).toBe(userId);
    expect(restored.videoId).toBe(videoId);
    expect(restored.type).toBe('VIDEO_PROCESSED');
    expect(restored.channel).toBe('EMAIL');
    expect(restored.originalFileName).toBe('demo.mp4');
    expect(restored.resultKey).toBe('outputs/user/video.zip');
    expect(restored.frameCount).toBe(10);
    expect(restored.createdAt.toISOString()).toBe('2026-09-28T12:00:00.000Z');
    expect(restored.sentAt).toBeNull();
    expect(restored.attempts).toHaveLength(1);
    expect(restored.attempts[0]?.error).toBe('smtp down');
  });
});
