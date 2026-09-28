import { describe, expect, it } from 'vitest';

import { NotifyVideoProcessedUseCase } from '../../../../../src/application/useCases/notifyVideoProcessed/NotifyVideoProcessedUseCase.js';
import { NotifyVideoFailedUseCase } from '../../../../../src/application/useCases/notifyVideoFailed/NotifyVideoFailedUseCase.js';
import { DispatchNotificationUseCase } from '../../../../../src/application/useCases/dispatchNotification/DispatchNotificationUseCase.js';
import { UpsertContactUseCase } from '../../../../../src/application/useCases/upsertContact/UpsertContactUseCase.js';
import { DeleteContactUseCase } from '../../../../../src/application/useCases/deleteContact/DeleteContactUseCase.js';
import { Contact } from '../../../../../src/domain/entities/contact.js';
import {
  InMemoryContactRepository,
  InMemoryNotificationRepository,
  RecordingMailGateway,
  StubObjectStorage,
} from '../../../../support/in-memory.js';

const videoId = '11111111-1111-4111-8111-111111111111';
const userId = '33333333-3333-4333-8333-333333333333';

const stack = (): {
  contacts: InMemoryContactRepository;
  notifications: InMemoryNotificationRepository;
  mail: RecordingMailGateway;
  dispatch: DispatchNotificationUseCase;
} => {
  const contacts = new InMemoryContactRepository();
  const notifications = new InMemoryNotificationRepository();
  const mail = new RecordingMailGateway();
  const dispatch = new DispatchNotificationUseCase(
    notifications,
    contacts,
    mail,
    new StubObjectStorage(),
    'http://localhost:3001',
    86_400,
    3,
  );
  return { contacts, notifications, mail, dispatch };
};

describe('NotifyVideoProcessedUseCase', () => {
  it('skips when ownerId is missing', async () => {
    const { notifications, dispatch } = stack();
    const result = await new NotifyVideoProcessedUseCase(notifications, dispatch).execute({
      videoId,
      resultKey: 'outputs/x/y.zip',
      frameCount: 2,
    });
    expect(result).toBeNull();
    expect(notifications.rows).toHaveLength(0);
  });

  it('creates one VIDEO_PROCESSED row per video and ignores a second delivery', async () => {
    const { contacts, notifications, mail, dispatch } = stack();
    await contacts.upsert(
      Contact.create({
        userId,
        name: 'Ada',
        email: 'ada@example.com',
        updatedAt: new Date(),
      }),
    );
    const useCase = new NotifyVideoProcessedUseCase(notifications, dispatch);
    const input = {
      videoId,
      ownerId: userId,
      originalFileName: 'demo.mp4',
      resultKey: `outputs/${userId}/${videoId}.zip`,
      frameCount: 8,
    };

    const first = await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(first?.status).toBe('SENT');
    expect(second?.id).toBe(first?.id);
    expect(notifications.rows).toHaveLength(1);
    expect(mail.sent).toHaveLength(1);
  });
});

describe('NotifyVideoFailedUseCase', () => {
  it('keeps uniqueness per (videoId, VIDEO_FAILED)', async () => {
    const { contacts, notifications, dispatch } = stack();
    await contacts.upsert(
      Contact.create({
        userId,
        name: 'Ada',
        email: 'ada@example.com',
        updatedAt: new Date(),
      }),
    );
    const useCase = new NotifyVideoFailedUseCase(notifications, dispatch);
    await useCase.execute({
      videoId,
      ownerId: userId,
      reason: 'bad media',
      originalFileName: 'a.mp4',
    });
    await useCase.execute({
      videoId,
      ownerId: userId,
      reason: 'bad media',
      originalFileName: 'a.mp4',
    });
    expect(notifications.rows.filter((row) => row.type === 'VIDEO_FAILED')).toHaveLength(1);
  });
});

describe('UpsertContactUseCase', () => {
  it('drains PENDING notifications when the contact appears', async () => {
    const { contacts, notifications, mail, dispatch } = stack();
    const notify = new NotifyVideoFailedUseCase(notifications, dispatch);
    await notify.execute({
      videoId,
      ownerId: userId,
      originalFileName: 'demo.mp4',
      reason: 'timeout',
    });
    expect(notifications.rows[0]?.status).toBe('PENDING');
    expect(mail.sent).toHaveLength(0);

    await new UpsertContactUseCase(contacts, notifications, dispatch).execute({
      userId,
      name: 'Ada',
      email: 'ada@example.com',
      occurredAt: new Date('2026-09-28T12:00:00.000Z'),
    });

    expect(notifications.rows[0]?.status).toBe('SENT');
    expect(mail.sent).toHaveLength(1);
  });

  it('discards a stale identity event', async () => {
    const { contacts, notifications, dispatch } = stack();
    const upsert = new UpsertContactUseCase(contacts, notifications, dispatch);
    await upsert.execute({
      userId,
      name: 'Ada',
      email: 'ada@example.com',
      occurredAt: new Date('2026-09-28T12:00:00.000Z'),
    });
    await upsert.execute({
      userId,
      name: 'Old',
      email: 'old@example.com',
      occurredAt: new Date('2026-09-28T11:00:00.000Z'),
    });
    expect(contacts.rows.get(userId)?.email).toBe('ada@example.com');
  });
});

describe('DeleteContactUseCase', () => {
  it('removes the contact and the notification history', async () => {
    const { contacts, notifications, dispatch } = stack();
    await contacts.upsert(
      Contact.create({
        userId,
        name: 'Ada',
        email: 'ada@example.com',
        updatedAt: new Date(),
      }),
    );
    await new NotifyVideoFailedUseCase(notifications, dispatch).execute({
      videoId,
      ownerId: userId,
      reason: 'gone',
    });

    await new DeleteContactUseCase(contacts, notifications).execute(userId);

    expect(contacts.rows.size).toBe(0);
    expect(notifications.rows).toHaveLength(0);
  });
});
