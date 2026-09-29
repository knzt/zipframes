/**
 * Demo data for a local auth-db.
 *
 * The UUIDs below are fixed on purpose: video-service and notifier-service
 * seed the same owner, so one `pnpm db:seed` per service produces a dataset
 * that lines up across the three banks. They are documented together in
 * docs/data/dados-de-demonstracao.md; a service cannot import another
 * service's code, so each seed repeats them.
 *
 * Idempotent: every write is an upsert, so running it twice changes nothing.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Matches BcryptPasswordHasher. Hashing here rather than pasting a digest
// keeps the seed honest if the cost factor ever changes.
const SALT_ROUNDS = 12;

const DEMO_PASSWORD = 'zipframes123';

const users = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Ana Demonstração',
    email: 'ana@zipframes.local',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Bruno Demonstração',
    email: 'bruno@zipframes.local',
  },
] as const;

const prisma = new PrismaClient();

const seed = async (): Promise<void> => {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      // The hash is left alone on a re-run: bcrypt salts every call, so
      // rewriting it would churn the row for no gain.
      update: { name: user.name, email: user.email },
      create: { ...user, passwordHash },
    });
  }

  console.log(`auth-db: ${String(users.length)} usuários (senha: ${DEMO_PASSWORD})`);
};

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
