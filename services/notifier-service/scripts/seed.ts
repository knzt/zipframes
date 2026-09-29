/**
 * Demo data for a local notification-db.
 *
 * The contacts and the video ids match what auth-service and video-service
 * seed, so the three banks tell one story: Ana's finished video has a sent
 * notification, her failed one has a notification that exhausted its
 * attempts, and her queued one has nothing yet. The UUIDs are documented
 * together in docs/data/dados-de-demonstracao.md, and repeated here
 * because a service cannot import another service's code.
 *
 * Idempotent: every write is an upsert, so running it twice changes nothing.
 */
import { PrismaClient, type Prisma } from '@prisma/client';

const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';

const ANA_DONE = 'a0000000-0000-4000-8000-000000000003';
const ANA_FAILED = 'a0000000-0000-4000-8000-000000000004';
const BRUNO_DONE = 'b0000000-0000-4000-8000-000000000001';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const now = Date.now();
const ago = (ms: number): Date => new Date(now - ms);

const contacts: readonly Prisma.ContactUncheckedCreateInput[] = [
  { userId: ANA, name: 'Ana Demonstração', email: 'ana@zipframes.local', updatedAt: ago(2 * HOUR) },
  {
    userId: BRUNO,
    name: 'Bruno Demonstração',
    email: 'bruno@zipframes.local',
    updatedAt: ago(2 * HOUR),
  },
];

// ck_notifications_sent: a SENT row must carry both sent_at and target.
const notifications: readonly Prisma.NotificationUncheckedCreateInput[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    userId: ANA,
    videoId: ANA_DONE,
    type: 'VIDEO_PROCESSED',
    status: 'SENT',
    target: 'ana@zipframes.local',
    originalFileName: 'aula-clean-architecture.mp4',
    resultKey: `outputs/${ANA}/${ANA_DONE}.zip`,
    frameCount: 428,
    uploadedAt: ago(3 * HOUR),
    createdAt: ago(3 * HOUR - 4 * MINUTE),
    sentAt: ago(3 * HOUR - 5 * MINUTE),
  },
  // Failed after exhausting MAX_ATTEMPTS: the attempts below are the trail.
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    userId: ANA,
    videoId: ANA_FAILED,
    type: 'VIDEO_FAILED',
    status: 'FAILED',
    target: 'ana@zipframes.local',
    originalFileName: 'gravacao-corrompida.mp4',
    uploadedAt: ago(6 * HOUR),
    createdAt: ago(6 * HOUR - 2 * MINUTE),
  },
  // Still in the queue the drain reads, so a local run has work to pick up.
  {
    id: 'c0000000-0000-4000-8000-000000000003',
    userId: BRUNO,
    videoId: BRUNO_DONE,
    type: 'VIDEO_PROCESSED',
    status: 'PENDING',
    originalFileName: 'onboarding-bruno.mp4',
    resultKey: `outputs/${BRUNO}/${BRUNO_DONE}.zip`,
    frameCount: 91,
    uploadedAt: ago(5 * HOUR),
    createdAt: ago(5 * HOUR - 3 * MINUTE),
  },
];

const attempts: readonly Prisma.NotificationAttemptUncheckedCreateInput[] = [
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    notificationId: 'c0000000-0000-4000-8000-000000000002',
    attempt: 1,
    target: 'ana@zipframes.local',
    error: 'connect ECONNREFUSED 127.0.0.1:1025',
    attemptedAt: ago(6 * HOUR - 3 * MINUTE),
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002',
    notificationId: 'c0000000-0000-4000-8000-000000000002',
    attempt: 2,
    target: 'ana@zipframes.local',
    error: 'connect ECONNREFUSED 127.0.0.1:1025',
    attemptedAt: ago(6 * HOUR - 4 * MINUTE),
  },
  {
    id: 'd0000000-0000-4000-8000-000000000003',
    notificationId: 'c0000000-0000-4000-8000-000000000002',
    attempt: 3,
    target: 'ana@zipframes.local',
    error: '550 mailbox unavailable',
    attemptedAt: ago(6 * HOUR - 5 * MINUTE),
  },
];

const prisma = new PrismaClient();

const seed = async (): Promise<void> => {
  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { userId: contact.userId },
      update: contact,
      create: contact,
    });
  }

  for (const notification of notifications) {
    await prisma.notification.upsert({
      where: { id: notification.id },
      update: notification,
      create: notification,
    });
  }

  // The attempts hang off a notification by FK, so they go in last.
  for (const attempt of attempts) {
    await prisma.notificationAttempt.upsert({
      where: {
        notificationId_attempt: {
          notificationId: attempt.notificationId,
          attempt: attempt.attempt,
        },
      },
      update: attempt,
      create: attempt,
    });
  }

  console.log(
    `notification-db: ${String(contacts.length)} contatos, ` +
      `${String(notifications.length)} notificações, ${String(attempts.length)} tentativas`,
  );
};

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
