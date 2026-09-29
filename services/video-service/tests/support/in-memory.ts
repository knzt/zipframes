import type { Readable } from 'node:stream';

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
  DownloadUrlSigner,
  SignDownloadInput,
  SignedDownloadUrl,
} from '../../src/application/interfaces/gateways/DownloadUrlSigner.js';
import type {
  FirstPageKey,
  VideoListCache,
} from '../../src/application/interfaces/gateways/VideoListCache.js';
import {
  VIDEO_CHANGED_CONCURRENTLY,
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
        .filter((video) => query.status === undefined || video.status === query.status)
        .filter((video) => video.createdAt.getTime() < before)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, query.limit),
    );
  }

  listAllByOwner(ownerId: string): Promise<readonly Video[]> {
    return Promise.resolve([...this.rows.values()].filter((video) => video.ownerId === ownerId));
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

  /** Same contract as the Prisma adapter: version 0 inserts, any other must match. */
  save(video: Video): Promise<Video> {
    const current = this.rows.get(video.id);
    const expectedVersion = current?.version ?? 0;
    if (video.version !== expectedVersion) {
      return Promise.reject(
        new ConflictError(VIDEO_CHANGED_CONCURRENTLY, 'the video changed meanwhile, try again'),
      );
    }
    const stored = Video.fromPersistence({ ...video.toJSON(), version: video.version + 1 });
    this.rows.set(video.id, stored);
    this.saves += 1;
    return Promise.resolve(stored);
  }

  deleteAllByOwner(ownerId: string): Promise<void> {
    for (const [id, video] of this.rows) {
      if (video.ownerId === ownerId) {
        this.rows.delete(id);
      }
    }
    return Promise.resolve();
  }
}

export class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, StoredObject>();
  readonly deleted: string[] = [];
  failUploadWith: Error | null = null;
  failDeleteWith: Error | null = null;

  put(key: string, sizeBytes: number): this {
    this.objects.set(key, { sizeBytes });
    return this;
  }

  /** Drains the stream the way S3 would and records what arrived. */
  async upload(key: string, content: Readable): Promise<StoredObject> {
    if (this.failUploadWith !== null) {
      content.resume();
      throw this.failUploadWith;
    }
    let sizeBytes = 0;
    for await (const chunk of content) {
      sizeBytes += (chunk as Buffer).length;
    }
    const stored = { sizeBytes };
    this.objects.set(key, stored);
    return stored;
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

export class FakeDownloadUrlSigner implements DownloadUrlSigner {
  readonly signed: SignDownloadInput[] = [];

  sign(download: SignDownloadInput): Promise<SignedDownloadUrl> {
    this.signed.push(download);
    return Promise.resolve({
      url: `https://storage.test/${download.key}`,
      expiresInSeconds: download.expiresInSeconds,
    });
  }
}

const pageKeyOf = (ownerId: string, page: FirstPageKey): string =>
  `${ownerId}:${String(page.limit)}:${page.status ?? '*'}`;

export class InMemoryVideoListCache implements VideoListCache {
  readonly pages = new Map<string, readonly Video[]>();
  readonly invalidated: string[] = [];

  get(ownerId: string, page: FirstPageKey): Promise<readonly Video[] | null> {
    return Promise.resolve(this.pages.get(pageKeyOf(ownerId, page)) ?? null);
  }

  set(ownerId: string, page: FirstPageKey, videos: readonly Video[]): Promise<void> {
    this.pages.set(pageKeyOf(ownerId, page), videos);
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
