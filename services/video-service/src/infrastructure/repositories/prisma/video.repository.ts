import { Prisma, type PrismaClient, type Video as VideoRow } from '@prisma/client';
import { ConflictError } from '@zipframes/core';

import {
  VIDEO_CHANGED_CONCURRENTLY,
  type ListByOwnerQuery,
  type VideoRepository,
} from '../../../application/interfaces/repositories/VideoRepository.js';
import { Video } from '../../../domain/entities/video.js';

const UNIQUE_VIOLATION = 'P2002';

const toDomain = (row: VideoRow): Video =>
  Video.fromPersistence({ ...row, sizeBytes: Number(row.sizeBytes) });

const toRow = (video: Video, version: number): Prisma.VideoCreateInput => {
  const state = video.toJSON();
  return { ...state, sizeBytes: BigInt(state.sizeBytes), version };
};

const changedConcurrently = (cause?: unknown): ConflictError =>
  new ConflictError(VIDEO_CHANGED_CONCURRENTLY, 'the video changed meanwhile, try again', {
    cause,
  });

export class PrismaVideoRepository implements VideoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(videoId: string): Promise<Video | null> {
    const row = await this.prisma.video.findUnique({ where: { id: videoId } });
    return row === null ? null : toDomain(row);
  }

  async findByIdForOwner(videoId: string, ownerId: string): Promise<Video | null> {
    const row = await this.prisma.video.findFirst({ where: { id: videoId, ownerId } });
    return row === null ? null : toDomain(row);
  }

  async listByOwner(ownerId: string, query: ListByOwnerQuery): Promise<readonly Video[]> {
    const rows = await this.prisma.video.findMany({
      where: {
        ownerId,
        status: query.status ?? { not: 'DELETED' },
        ...(query.before !== undefined ? { createdAt: { lt: query.before } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
    return rows.map(toDomain);
  }

  async listAllByOwner(ownerId: string): Promise<readonly Video[]> {
    const rows = await this.prisma.video.findMany({ where: { ownerId } });
    return rows.map(toDomain);
  }

  async findExpired(now: Date, limit: number): Promise<readonly Video[]> {
    const rows = await this.prisma.video.findMany({
      where: { status: 'DONE', expiresAt: { lte: now } },
      orderBy: { expiresAt: 'asc' },
      take: limit,
    });
    return rows.map(toDomain);
  }

  /**
   * Version 0 means the video was never stored: it is inserted as version 1.
   * Any other version is written only if the row still has it, and bumped.
   */
  async save(video: Video): Promise<Video> {
    return video.version === 0 ? this.insert(video) : this.update(video);
  }

  private async insert(video: Video): Promise<Video> {
    try {
      return toDomain(await this.prisma.video.create({ data: toRow(video, 1) }));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw changedConcurrently(error);
      }
      throw error;
    }
  }

  private async update(video: Video): Promise<Video> {
    const { id, ...columns } = toRow(video, video.version + 1);
    const { count } = await this.prisma.video.updateMany({
      where: { id, version: video.version },
      data: columns,
    });
    if (count === 0) {
      throw changedConcurrently();
    }
    return Video.fromPersistence({ ...video.toJSON(), version: video.version + 1 });
  }

  async deleteAllByOwner(ownerId: string): Promise<void> {
    await this.prisma.video.deleteMany({ where: { ownerId } });
  }
}
