import { ConflictError } from '@zipframes/core';

import type {
  EventPublisher,
  EventPublisherInput,
} from '../../src/application/interfaces/gateways/EventPublisher.js';
import type {
  ObjectStorage,
  StoredObject,
} from '../../src/application/interfaces/gateways/ObjectStorage.js';
import type {
  SignDownloadInput,
  SignedUrl,
  SignUploadInput,
  StorageUrlSigner,
} from '../../src/application/interfaces/gateways/StorageUrlSigner.js';
import type { VideoListCache } from '../../src/application/interfaces/gateways/VideoListCache.js';
import {
  CONCURRENT_VIDEO_UPDATE,
  type ListByOwnerQuery,
  type VideoRepository,
} from '../../src/application/interfaces/repositories/VideoRepository.js';
import { Video } from '../../src/domain/entities/video.js';

/**
 * In-memory stand-ins for the interfaces the use cases declare. The
 * repository keeps the same guarantee as the Prisma one: an optimistic lock
 * on `version`.
 */
export class InMemoryVideoRepository implements VideoRepository {
  readonly rows = new Map<string, Video>();
  saves = 0;

  seed(...videos: Video[]): this {
    for (const video of videos) {
      this.rows.set(video.id, video);
    }
    return this;
  }

  create(video: Video): Promise<void> {
    this.rows.set(video.id, video);
    return Promise.resolve();
  }

  findById(videoId: string): Promise<Video | null> {
    return Promise.resolve(this.rows.get(videoId) ?? null);
  }

  findByIdForOwner(videoId: string, ownerId: string): Promise<Video | null> {
    const video = this.rows.get(videoId);
    return Promise.resolve(video?.ownerId === ownerId ? video : null);
  }

  listByOwner(ownerId: string, query: ListByOwnerQuery): Promise<readonly Video[]> {
    const before = query.before?.getTime() ?? Number.POSITIVE_INFINITY;
    return Promise.resolve(
      [...this.rows.values()]
        .filter((video) => video.ownerId === ownerId && video.status !== 'DELETED')
        .filter((video) => video.createdAt.getTime() < before)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, query.limit),
    );
  }

  findExpired(now: Date, limit: number): Promise<readonly Video[]> {
    return Promise.resolve(
      [...this.rows.values()]
        .filter(
          (video) =>
            video.status === 'DONE' &&
            video.expiresAt !== null &&
            video.expiresAt.getTime() <= now.getTime(),
        )
        .slice(0, limit),
    );
  }

  save(video: Video): Promise<void> {
    const current = this.rows.get(video.id);
    if (current?.version !== video.version) {
      throw new ConflictError(CONCURRENT_VIDEO_UPDATE, 'the video changed meanwhile, try again');
    }
    this.rows.set(
      video.id,
      Video.fromPersistence({ ...video.toJSON(), version: video.version + 1 }),
    );
    this.saves += 1;
    return Promise.resolve();
  }
}

export class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  readonly deleted: string[] = [];
  failDeleteWith: Error | null = null;

  put(key: string, sizeBytes: number): this {
    this.objects.set(key, { sizeBytes });
    return this;
  }

  head(key: string): Promise<StoredObject | null> {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  deleteObject(key: string): Promise<void> {
    if (this.failDeleteWith !== null) {
      return Promise.reject(this.failDeleteWith);
    }
    this.objects.delete(key);
    this.deleted.push(key);
    return Promise.resolve();
  }
}

export class FakeStorageUrlSigner implements StorageUrlSigner {
  readonly uploads: SignUploadInput[] = [];
  readonly downloads: SignDownloadInput[] = [];

  signUpload(input: SignUploadInput): Promise<SignedUrl> {
    this.uploads.push(input);
    return Promise.resolve({
      url: `https://storage.test/${input.key}?op=put`,
      expiresInSeconds: input.expiresInSeconds,
    });
  }

  signDownload(input: SignDownloadInput): Promise<SignedUrl> {
    this.downloads.push(input);
    return Promise.resolve({
      url: `https://storage.test/${input.key}?op=get`,
      expiresInSeconds: input.expiresInSeconds,
    });
  }
}

export class InMemoryVideoListCache implements VideoListCache {
  readonly pages = new Map<string, readonly Video[]>();
  readonly invalidated: string[] = [];

  get(ownerId: string, limit: number): Promise<readonly Video[] | null> {
    return Promise.resolve(this.pages.get(`${ownerId}:${String(limit)}`) ?? null);
  }

  set(ownerId: string, limit: number, videos: readonly Video[]): Promise<void> {
    this.pages.set(`${ownerId}:${String(limit)}`, videos);
    return Promise.resolve();
  }

  invalidate(ownerId: string): Promise<void> {
    this.invalidated.push(ownerId);
    for (const key of [...this.pages.keys()]) {
      if (key.startsWith(`${ownerId}:`)) {
        this.pages.delete(key);
      }
    }
    return Promise.resolve();
  }
}

export class InMemoryEventPublisher implements EventPublisher {
  readonly published: EventPublisherInput[] = [];
  failWith: Error | null = null;

  publish(input: EventPublisherInput): Promise<void> {
    if (this.failWith !== null) {
      return Promise.reject(this.failWith);
    }
    this.published.push(input);
    return Promise.resolve();
  }
}
