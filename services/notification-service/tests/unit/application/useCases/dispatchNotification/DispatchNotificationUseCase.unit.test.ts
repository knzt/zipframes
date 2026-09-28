import { UnavailableError } from '@zipframes/core';
import { describe, expect, it } from 'vitest';

import { DispatchNotificationUseCase } from '../../../../../src/application/useCases/dispatchNotification/DispatchNotificationUseCase.js';
import { Notification } from '../../../../../src/domain/entities/notification.js';
import { Contact } from '../../../../../src/domain/entities/contact.js';
import {
  InMemoryContactRepository,
  InMemoryNotificationRepository,
  RecordingMailGateway,
  StubObjectStorage,
} from '../../../../support/in-memory.js';

const videoId = '11111111-1111-4111-8111-111111111111';
const userId = '33333333-3333-4333-8333-333333333333';
const appPublicUrl = 'http://localhost:3001';

const processed = (): Notification =>
  Notification.create({
    id: '44444444-4444-4444-8444-444444444444',
    userId,
    videoId,
    type: 'VIDEO_PROCESSED',
    originalFileName: 'clip.mp4',
    resultKey: `outputs/${userId}/${videoId}.zip`,
    frameCount: 12,
    createdAt: new Date('2026-09-28T12:00:00.000Z'),
  });

const failed = (): Notification =>
  Notification.create({
    id: '66666666-6666-4666-8666-666666666666',
    userId,
    videoId,
    type: 'VIDEO_FAILED',
    originalFileName: 'clip.mp4',
    failureReason: 'no frames extracted',
    createdAt: new Date('2026-09-28T12:00:00.000Z'),
  });

const contact = (): Contact =>
  Contact.create({
    userId,
    name: 'Ada',
    email: 'ada@example.com',
    updatedAt: new Date('2026-09-28T11:00:00.000Z'),
  });

const requireNotification = async (
  notifications: InMemoryNotificationRepository,
): Promise<Notification> => {
  const found = await notifications.findByVideoIdAndType(videoId, 'VIDEO_PROCESSED');
  expect(found).not.toBeNull();
  if (found === null) {
    throw new Error('expected a VIDEO_PROCESSED notification');
  }
  return found;
};

const dispatchOf = (
  notifications: InMemoryNotificationRepository,
  contacts: InMemoryContactRepository,
  mail: RecordingMailGateway,
): DispatchNotificationUseCase =>
  new DispatchNotificationUseCase(
    notifications,
    contacts,
    mail,
    new StubObjectStorage('https://storage.example/clip.zip?X-Amz-Signature=test'),
    appPublicUrl,
    86_400,
    3,
  );

describe('DispatchNotificationUseCase', () => {
  it('leaves the notification PENDING when the contact is missing', async () => {
    const notifications = new InMemoryNotificationRepository();
    const contacts = new InMemoryContactRepository();
    const mail = new RecordingMailGateway();
    const notification = await notifications.save(processed());

    const result = await dispatchOf(notifications, contacts, mail).execute(notification);

    expect(result.status).toBe('PENDING');
    expect(mail.sent).toHaveLength(0);
  });

  it('sends a processed mail with the signed URL and the download fallback', async () => {
    const notifications = new InMemoryNotificationRepository();
    const contacts = new InMemoryContactRepository();
    await contacts.upsert(contact());
    const mail = new RecordingMailGateway();
    const notification = await notifications.save(processed());

    const result = await dispatchOf(notifications, contacts, mail).execute(notification);

    expect(result.status).toBe('SENT');
    expect(result.target).toBe('ada@example.com');
    expect(mail.sent[0]?.subject).toContain('clip.mp4');
    expect(mail.sent[0]?.text).toContain('https://storage.example/clip.zip?X-Amz-Signature=test');
    expect(mail.sent[0]?.text).toContain(`http://localhost:3001/videos/${videoId}/download`);
  });

  it('sends a failure mail without a content link', async () => {
    const notifications = new InMemoryNotificationRepository();
    const contacts = new InMemoryContactRepository();
    await contacts.upsert(contact());
    const mail = new RecordingMailGateway();
    const notification = await notifications.save(failed());

    const result = await dispatchOf(notifications, contacts, mail).execute(notification);

    expect(result.status).toBe('SENT');
    expect(mail.sent[0]?.text).toContain('no frames extracted');
    expect(mail.sent[0]?.text).not.toContain('http://localhost:3001/videos');
  });

  it('records SMTP failures and throws until the third attempt, then marks FAILED', async () => {
    const notifications = new InMemoryNotificationRepository();
    const contacts = new InMemoryContactRepository();
    await contacts.upsert(contact());
    const mail = new RecordingMailGateway();
    mail.failTimes = 3;
    let notification = await notifications.save(processed());
    const dispatch = dispatchOf(notifications, contacts, mail);

    await expect(dispatch.execute(notification)).rejects.toBeInstanceOf(UnavailableError);
    notification = await requireNotification(notifications);
    expect(notification.failedAttemptCount).toBe(1);
    expect(notification.status).toBe('PENDING');

    await expect(dispatch.execute(notification)).rejects.toBeInstanceOf(UnavailableError);
    notification = await requireNotification(notifications);
    expect(notification.failedAttemptCount).toBe(2);

    const last = await dispatch.execute(notification);
    expect(last.status).toBe('FAILED');
    expect(last.failedAttemptCount).toBe(3);
    expect(mail.sent).toHaveLength(0);
  });

  it('does not send again once SENT', async () => {
    const notifications = new InMemoryNotificationRepository();
    const contacts = new InMemoryContactRepository();
    await contacts.upsert(contact());
    const mail = new RecordingMailGateway();
    const sent = processed().markSent('ada@example.com', new Date());
    await notifications.save(sent);

    await dispatchOf(notifications, contacts, mail).execute(sent);
    expect(mail.sent).toHaveLength(0);
  });

  it('rejects a processed notification without a result key', async () => {
    const notifications = new InMemoryNotificationRepository();
    const contacts = new InMemoryContactRepository();
    await contacts.upsert(contact());
    const mail = new RecordingMailGateway();
    const notification = Notification.create({
      id: '77777777-7777-4777-8777-777777777777',
      userId,
      videoId,
      type: 'VIDEO_PROCESSED',
      originalFileName: 'clip.mp4',
      createdAt: new Date('2026-09-28T12:00:00.000Z'),
    });
    await notifications.save(notification);

    await expect(
      dispatchOf(notifications, contacts, mail).execute(notification),
    ).rejects.toBeInstanceOf(UnavailableError);
  });
});
