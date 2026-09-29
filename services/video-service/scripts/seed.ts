/**
 * Demo data for a local video-db.
 *
 * One video per status, all owned by the demo user auth-service seeds, so
 * `GET /videos?status=…` has something to return in every branch. The
 * owner UUIDs are fixed and shared with the other two seeds; they are
 * documented together in docs/data/dados-de-demonstracao.md, and repeated
 * here because a service cannot import another service's code.
 *
 * Idempotent: every write is an upsert, so running it twice changes nothing.
 */
import { PrismaClient, type Prisma, type VideoStatus } from '@prisma/client';

const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';

// Mirrors src/domain/policies/storageKeys.ts. The seed writes rows, not
// objects, so nothing in the bucket backs these keys: a DONE row is
// listable and its metadata is right, but its download 404s until the
// worker actually produces the package.
const sourceKeyFor = (ownerId: string, videoId: string): string => `uploads/${ownerId}/${videoId}`;
const framesPackageKeyFor = (ownerId: string, videoId: string): string =>
  `outputs/${ownerId}/${videoId}.zip`;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const now = Date.now();
const ago = (ms: number): Date => new Date(now - ms);
const ahead = (ms: number): Date => new Date(now + ms);

interface SeedVideo {
  readonly id: string;
  readonly ownerId: string;
  readonly originalFileName: string;
  readonly sizeBytes: bigint;
  readonly status: VideoStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
  readonly resultKey?: string;
  readonly frameCount?: number;
  readonly errorCode?: string;
  readonly failureReason?: string;
  readonly expiresAt?: Date;
}

// The CHECK constraints in the init migration are what these rows respect:
// DONE carries a package, an expiry and a frame count; FAILED carries a
// reason; EXPIRED and DELETED carry no package.
const videos: readonly SeedVideo[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    ownerId: ANA,
    originalFileName: 'apresentacao-fiap.mp4',
    sizeBytes: 18_432_000n,
    status: 'QUEUED',
    createdAt: ago(2 * MINUTE),
    updatedAt: ago(2 * MINUTE),
    version: 0,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    ownerId: ANA,
    originalFileName: 'demo-produto.mp4',
    sizeBytes: 47_185_920n,
    status: 'PROCESSING',
    createdAt: ago(10 * MINUTE),
    updatedAt: ago(1 * MINUTE),
    version: 1,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    ownerId: ANA,
    originalFileName: 'aula-clean-architecture.mp4',
    sizeBytes: 104_857_600n,
    status: 'DONE',
    resultKey: framesPackageKeyFor(ANA, 'a0000000-0000-4000-8000-000000000003'),
    frameCount: 428,
    expiresAt: ahead(23 * HOUR),
    createdAt: ago(3 * HOUR),
    updatedAt: ago(3 * HOUR - 4 * MINUTE),
    version: 2,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    ownerId: ANA,
    originalFileName: 'gravacao-corrompida.mp4',
    sizeBytes: 2_097_152n,
    status: 'FAILED',
    errorCode: 'INVALID_MEDIA',
    failureReason: 'ffmpeg could not read a video stream from the upload',
    createdAt: ago(6 * HOUR),
    updatedAt: ago(6 * HOUR - 2 * MINUTE),
    version: 2,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000005',
    ownerId: ANA,
    originalFileName: 'retrospectiva-sprint-8.mp4',
    sizeBytes: 62_914_560n,
    status: 'EXPIRED',
    frameCount: 156,
    expiresAt: ago(2 * HOUR),
    createdAt: ago(2 * DAY),
    updatedAt: ago(2 * HOUR),
    version: 3,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000006',
    ownerId: ANA,
    originalFileName: 'teste-descartado.mp4',
    sizeBytes: 5_242_880n,
    status: 'DELETED',
    createdAt: ago(4 * DAY),
    updatedAt: ago(3 * DAY),
    version: 2,
  },
  // Bruno's single video is what makes an owner-scoped list visibly
  // scoped: it must never show up under Ana's token.
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    ownerId: BRUNO,
    originalFileName: 'onboarding-bruno.mp4',
    sizeBytes: 12_582_912n,
    status: 'DONE',
    resultKey: framesPackageKeyFor(BRUNO, 'b0000000-0000-4000-8000-000000000001'),
    frameCount: 91,
    expiresAt: ahead(20 * HOUR),
    createdAt: ago(5 * HOUR),
    updatedAt: ago(5 * HOUR - 3 * MINUTE),
    version: 2,
  },
];

const toRow = (video: SeedVideo): Prisma.VideoUncheckedCreateInput => ({
  id: video.id,
  ownerId: video.ownerId,
  originalFileName: video.originalFileName,
  contentType: 'video/mp4',
  sizeBytes: video.sizeBytes,
  sourceKey: sourceKeyFor(video.ownerId, video.id),
  resultKey: video.resultKey ?? null,
  frameCount: video.frameCount ?? null,
  status: video.status,
  errorCode: video.errorCode ?? null,
  failureReason: video.failureReason ?? null,
  expiresAt: video.expiresAt ?? null,
  createdAt: video.createdAt,
  updatedAt: video.updatedAt,
  version: video.version,
});

const prisma = new PrismaClient();

const seed = async (): Promise<void> => {
  for (const video of videos) {
    const row = toRow(video);
    await prisma.video.upsert({ where: { id: video.id }, update: row, create: row });
  }

  console.log(`video-db: ${String(videos.length)} vídeos`);
};

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
