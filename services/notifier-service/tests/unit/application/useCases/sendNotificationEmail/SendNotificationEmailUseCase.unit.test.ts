import { UnavailableError } from '@zipframes/core';
import { describe, expect, it } from 'vitest';

import { SendNotificationEmailUseCase } from '../../../../../src/application/useCases/sendNotificationEmail/SendNotificationEmailUseCase.js';
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
    uploadedAt: new Date('2026-09-22T12:00:00.000Z'),
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

const sendOf = (
  notifications: InMemoryNotificationRepository,
  contacts: InMemoryContactRepository,
  mail: RecordingMailGateway,
): SendNotificationEmailUseCase =>
  new SendNotificationEmailUseCase(
    notifications,
    contacts,
    mail,
    new StubObjectStorage('https://storage.example/clip.zip?X-Amz-Signature=test'),
    appPublicUrl,
    86_400,
    3,
  );

describe('SendNotificationEmailUseCase', () => {
  it('leaves the notification PENDING when the contact is missing', async () => {
    const notifications = new InMemoryNotificationRepository();
    const contacts = new InMemoryContactRepository();
    const mail = new RecordingMailGateway();
    const notification = await notifications.save(processed());

    const result = await sendOf(notifications, contacts, mail).execute(notification);

    expect(result.status).toBe('PENDING');
    expect(mail.sent).toHaveLength(0);
  });

  it('sends a processed mail with the signed URL and the download fallback', async () => {
    const notifications = new InMemoryNotificationRepository();
    const contacts = new InMemoryContactRepository();
    await contacts.upsert(contact());
    const mail = new RecordingMailGateway();
    const notification = await notifications.save(processed());

    const result = await sendOf(notifications, contacts, mail).execute(notification);

    expect(result.status).toBe('SENT');
    expect(result.target).toBe('ada@example.com');
    expect(mail.sent[0]?.subject).toContain('clip.mp4');
    expect(mail.sent[0]?.text).toContain('https://storage.example/clip.zip?X-Amz-Signature=test');
    expect(mail.sent[0]?.text).toContain(
      'http://localhost:3001/videos/11111111-1111-4111-8111-111111111111/download',
    );
    expect(mail.sent[0]?.text).toContain('Se ele falhar, gere um novo em:');
    expect(mail.sent[0]?.text).toContain('O arquivo expira em 24 horas.');
    expect(mail.sent[0]?.text).not.toContain('JWT Bearer');
  });

  it('sends a failure mail without a content link', async () => {
    const notifications = new InMemoryNotificationRepository();
    const contacts = new InMemoryContactRepository();
    await contacts.upsert(contact());
    const mail = new RecordingMailGateway();
    const notification = await notifications.save(failed());

    const result = await sendOf(notifications, contacts, mail).execute(notification);

    expect(result.status).toBe('SENT');
    expect(mail.sent[0]?.text).toContain('clip.mp4');
    expect(mail.sent[0]?.text).toContain('enviado em 22/09/2026');
    expect(mail.sent[0]?.text).toContain('http://localhost:3001/videos');
    expect(mail.sent[0]?.text).not.toContain('no frames extracted');
    expect(mail.sent[0]?.text).not.toContain('/download');
  });

  it('records SMTP failures and throws until the third attempt, then marks FAILED', async () => {
    const notifications = new InMemoryNotificationRepository();
    const contacts = new InMemoryContactRepository();
    await contacts.upsert(contact());
    const mail = new RecordingMailGateway();
    mail.failTimes = 3;
    let notification = await notifications.save(processed());
    const sendNotificationEmail = sendOf(notifications, contacts, mail);

    await expect(sendNotificationEmail.execute(notification)).rejects.toBeInstanceOf(
      UnavailableError,
    );
    notification = await requireNotification(notifications);
    expect(notification.failedAttemptCount).toBe(1);
    expect(notification.status).toBe('PENDING');

    await expect(sendNotificationEmail.execute(notification)).rejects.toBeInstanceOf(
      UnavailableError,
    );
    notification = await requireNotification(notifications);
    expect(notification.failedAttemptCount).toBe(2);

    const last = await sendNotificationEmail.execute(notification);
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

    await sendOf(notifications, contacts, mail).execute(sent);
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
      sendOf(notifications, contacts, mail).execute(notification),
    ).rejects.toBeInstanceOf(UnavailableError);
  });
});
