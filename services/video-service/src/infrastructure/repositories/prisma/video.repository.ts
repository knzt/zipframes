import type { Prisma, PrismaClient, Video as VideoRow } from '@prisma/client';
import { ConflictError } from '@zipframes/core';

import {
  CONCURRENT_VIDEO_UPDATE,
  type ListByOwnerQuery,
  type VideoRepository,
} from '../../../application/interfaces/repositories/VideoRepository.js';
import { Video } from '../../../domain/entities/video.js';

const toDomain = (row: VideoRow): Video =>
  Video.fromPersistence({ ...row, sizeBytes: Number(row.sizeBytes) });

/** Everything a transition may change. Identity, owner and keys never move. */
const mutableColumnsOf = (video: Video): Prisma.VideoUpdateManyMutationInput => {
  const state = video.toJSON();
  return {
    sizeBytes: BigInt(state.sizeBytes),
    resultKey: state.resultKey,
    frameCount: state.frameCount,
    status: state.status,
    errorCode: state.errorCode,
    failureReason: state.failureReason,
    expiresAt: state.expiresAt,
    sourcePurgedAt: state.sourcePurgedAt,
    resultPurgedAt: state.resultPurgedAt,
    updatedAt: state.updatedAt,
    version: { increment: 1 },
  };
};

export class PrismaVideoRepository implements VideoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(video: Video): Promise<void> {
    const state = video.toJSON();
    await this.prisma.video.create({
      data: { ...state, sizeBytes: BigInt(state.sizeBytes) },
    });
  }

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
        status: { not: 'DELETED' },
        ...(query.before !== undefined ? { createdAt: { lt: query.before } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
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

  async save(video: Video): Promise<void> {
    const { count } = await this.prisma.video.updateMany({
      where: { id: video.id, version: video.version },
      data: mutableColumnsOf(video),
    });
    if (count === 0) {
      throw new ConflictError(CONCURRENT_VIDEO_UPDATE, 'the video changed meanwhile, try again');
    }
  }
}
