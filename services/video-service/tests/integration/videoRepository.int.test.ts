import { randomUUID } from 'node:crypto';

import { startPostgres, type PostgresHandle } from '@zipframes/test-toolkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  VIDEO_CHANGED_CONCURRENTLY,
  type ListByOwnerQuery,
} from '../../src/application/interfaces/repositories/VideoRepository.js';
import type { Video } from '../../src/domain/entities/video.js';
import { PrismaVideoRepository } from '../../src/infrastructure/repositories/prisma/video.repository.js';
import { createPrisma, type Prisma } from '../../src/main/factories/externals/prisma.js';
import { migrate } from '../support/video-service.js';
import { aVideo } from '../support/videos.js';

let postgres: PostgresHandle;
let prisma: Prisma;
let repository: PrismaVideoRepository;

beforeAll(async () => {
  postgres = await startPostgres();
  await migrate(postgres.connectionUri);
  prisma = createPrisma(postgres.connectionUri);
  repository = new PrismaVideoRepository(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
  await postgres.stop();
});

/** A video never stored yet, owned by a fresh user. */
const aNewVideo = (status: Parameters<typeof aVideo>[0] = 'QUEUED'): ReturnType<typeof aVideo> =>
  aVideo(status, { id: randomUUID(), ownerId: randomUUID(), version: 0 });

/** A DONE video, never stored, whose window ends `offsetMs` from now. */
const aDoneVideoExpiringIn = (offsetMs: number): ReturnType<typeof aVideo> => {
  const id = randomUUID();
  const ownerId = randomUUID();
  return aVideo('DONE', {
    id,
    ownerId,
    resultKey: `outputs/${ownerId}/${id}.zip`,
    expiresAt: new Date(Date.now() + offsetMs),
    version: 0,
  });
};

describe('PrismaVideoRepository.save', () => {
  it('inserts a new video as version 1 and bumps the version on each update', async () => {
    const inserted = await repository.save(aNewVideo());
    const started = inserted.applyProcessingEvent(
      { kind: 'started' },
      { retentionMs: 1000, now: new Date() },
    );
    if (started.kind !== 'applied') throw new Error('expected the start to apply');

    const updated = await repository.save(started.video);

    expect(inserted.version).toBe(1);
    expect(updated.version).toBe(2);
    expect((await repository.findById(updated.id))?.toJSON()).toEqual(updated.toJSON());
  });

  it('lets only one of two writers based on the same read win', async () => {
    const stored = await repository.save(aNewVideo());
    const failure = { errorCode: 'X', reason: 'first writer', now: new Date() };
    const first = stored.fail(failure);
    const second = stored.fail({ ...failure, reason: 'second writer' });
    if (!first.ok || !second.ok) throw new Error('expected both transitions to be valid');

    await repository.save(first.value);

    await expect(repository.save(second.value)).rejects.toMatchObject({
      code: VIDEO_CHANGED_CONCURRENTLY,
    });
    expect((await repository.findById(stored.id))?.failureReason).toBe('first writer');
  });

  it('refuses to insert the same video twice', async () => {
    const video = aNewVideo();
    await repository.save(video);

    await expect(repository.save(video)).rejects.toMatchObject({
      code: VIDEO_CHANGED_CONCURRENTLY,
    });
  });
});

describe('PrismaVideoRepository queries', () => {
  it('finds DONE videos whose window ended, and nothing else', async () => {
    const expired = await repository.save(aDoneVideoExpiringIn(-1000));
    const fresh = await repository.save(aDoneVideoExpiringIn(60_000));

    const found = (await repository.findExpired(new Date(), 100)).map((video) => video.id);

    expect(found).toContain(expired.id);
    expect(found).not.toContain(fresh.id);
  });

  it('lists an owner newest first, filtered by status and never with deleted videos', async () => {
    const ownerId = randomUUID();
    const stored = async (status: Parameters<typeof aVideo>[0], minute: number): Promise<Video> =>
      repository.save(
        aVideo(status, {
          id: randomUUID(),
          ownerId,
          createdAt: new Date(Date.UTC(2026, 8, 27, 10, minute)),
          version: 0,
        }),
      );
    const failed = await stored('FAILED', 1);
    const queued = await stored('QUEUED', 2);
    await stored('DELETED', 3);

    const ids = async (query: ListByOwnerQuery): Promise<string[]> =>
      (await repository.listByOwner(ownerId, query)).map((video) => video.id);

    expect(await ids({ limit: 10 })).toEqual([queued.id, failed.id]);
    expect(await ids({ limit: 10, status: 'FAILED' })).toEqual([failed.id]);
    expect(await ids({ limit: 10, before: queued.createdAt })).toEqual([failed.id]);
  });

  it('scopes a lookup to the owner', async () => {
    const video = await repository.save(aNewVideo());

    expect(await repository.findByIdForOwner(video.id, video.ownerId)).not.toBeNull();
    expect(await repository.findByIdForOwner(video.id, randomUUID())).toBeNull();
  });
});

describe('the videos table', () => {
  it('refuses a row that breaks an invariant, whatever the write path', async () => {
    await expect(
      prisma.video.create({
        data: { ...aNewVideo('DONE').toJSON(), sizeBytes: 10n, resultKey: null },
      }),
    ).rejects.toThrow(/ck_videos_done/u);
  });
});
