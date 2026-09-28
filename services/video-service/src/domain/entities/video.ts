import { randomUUID } from 'node:crypto';

import { err, ok, ValidationError } from '@zipframes/core';
import type { Brand, Result } from '@zipframes/core';

import { InvalidVideoTransitionError } from '../errors/videoErrors.js';
import { framesPackageKeyFor, sourceKeyFor } from '../policies/storageKeys.js';
import { asFileName, type FileName } from '../valueObjects/fileName.js';
import type { VideoFile } from '../valueObjects/videoFile.js';
import { DELETABLE, PROCESSING_FINISHED, type VideoStatus } from '../valueObjects/videoStatus.js';

export type VideoId = Brand<string, 'VideoId'>;
export type OwnerId = Brand<string, 'OwnerId'>;

/** Compile-time brands only; a stored or freshly generated UUID is already valid. */
export const brandVideoId = (id: string): VideoId => id as VideoId;
export const brandOwnerId = (id: string): OwnerId => id as OwnerId;

/** The id is known before the video exists, because the file is stored under it first. */
export const newVideoId = (): VideoId => brandVideoId(randomUUID());

const ERROR_CODE_MAX_LENGTH = 50;

export interface ReceiveVideoProps {
  readonly id: VideoId;
  readonly ownerId: string;
  readonly file: VideoFile;
  /** Bytes the storage actually received. */
  readonly sizeBytes: number;
  readonly maxSizeBytes: number;
  readonly now: Date;
}

export interface FailureProps {
  readonly errorCode: string;
  readonly reason: string;
  readonly now: Date;
}

export interface PersistedVideo {
  readonly id: string;
  readonly ownerId: string;
  readonly originalFileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly sourceKey: string;
  readonly resultKey: string | null;
  readonly frameCount: number | null;
  readonly status: VideoStatus;
  readonly errorCode: string | null;
  readonly failureReason: string | null;
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-lock counter: 0 until the video is first stored. */
  readonly version: number;
}

interface VideoState extends Omit<PersistedVideo, 'id' | 'ownerId' | 'originalFileName'> {
  readonly id: VideoId;
  readonly ownerId: OwnerId;
  readonly originalFileName: FileName;
}

/** What the processing context reported, already stripped of transport. */
export type ProcessingEvent =
  | { readonly kind: 'started' }
  | { readonly kind: 'completed'; readonly resultKey: string; readonly frameCount: number }
  | { readonly kind: 'failed'; readonly errorCode: string; readonly reason: string };

export type IgnoredProcessingReason =
  'processing_finished' | 'already_processing' | 'foreign_result_key';

export type ProcessingEventOutcome =
  | { readonly kind: 'applied'; readonly video: Video }
  | { readonly kind: 'ignored'; readonly reason: IgnoredProcessingReason };

export type DownloadAvailability =
  | { readonly kind: 'available'; readonly resultKey: string }
  | { readonly kind: 'not_ready' }
  | { readonly kind: 'gone' };

/**
 * The Video aggregate: one uploaded file and everything that happens to it
 * until the frames package expires or the owner deletes it.
 *
 * Instances are immutable. Every transition returns a new `Video` with
 * `updatedAt` moved to `now`.
 */
export class Video {
  private constructor(private readonly state: VideoState) {}

  /** A file the storage already holds, queued for processing. */
  static receive(props: ReceiveVideoProps): Result<Video, ValidationError> {
    if (!Number.isSafeInteger(props.sizeBytes) || props.sizeBytes <= 0) {
      return err(new ValidationError('INVALID_FILE_SIZE', 'the file is empty'));
    }
    if (props.sizeBytes > props.maxSizeBytes) {
      return err(
        new ValidationError(
          'FILE_TOO_LARGE',
          `file size must be at most ${String(props.maxSizeBytes)} bytes`,
        ),
      );
    }

    const ownerId = brandOwnerId(props.ownerId);
    return ok(
      new Video({
        id: props.id,
        ownerId,
        originalFileName: props.file.name,
        contentType: props.file.contentType,
        sizeBytes: props.sizeBytes,
        sourceKey: sourceKeyFor(ownerId, props.id),
        resultKey: null,
        frameCount: null,
        status: 'QUEUED',
        errorCode: null,
        failureReason: null,
        expiresAt: null,
        createdAt: props.now,
        updatedAt: props.now,
        version: 0,
      }),
    );
  }

  static fromPersistence(data: PersistedVideo): Video {
    return new Video({
      ...data,
      id: brandVideoId(data.id),
      ownerId: brandOwnerId(data.ownerId),
      originalFileName: asFileName(data.originalFileName),
    });
  }

  /**
   * Applies what the worker reported. Once processing is over, any later
   * event is ignored; that is what makes redelivered or out-of-order events
   * harmless without a deduplication table. `QUEUED` may jump straight to
   * `DONE` or `FAILED` because the start event can arrive late.
   */
  applyProcessingEvent(
    event: ProcessingEvent,
    props: { readonly retentionMs: number; readonly now: Date },
  ): ProcessingEventOutcome {
    if (PROCESSING_FINISHED.includes(this.state.status)) {
      return { kind: 'ignored', reason: 'processing_finished' };
    }

    switch (event.kind) {
      case 'started':
        if (this.state.status === 'PROCESSING') {
          return { kind: 'ignored', reason: 'already_processing' };
        }
        return { kind: 'applied', video: this.next(props.now, { status: 'PROCESSING' }) };
      case 'completed':
        // The key is derived, never trusted: an event naming another object
        // would otherwise hand this owner a download URL for it.
        if (event.resultKey !== framesPackageKeyFor(this.state.ownerId, this.state.id)) {
          return { kind: 'ignored', reason: 'foreign_result_key' };
        }
        return {
          kind: 'applied',
          video: this.next(props.now, {
            status: 'DONE',
            resultKey: event.resultKey,
            frameCount: event.frameCount,
            expiresAt: new Date(props.now.getTime() + props.retentionMs),
          }),
        };
      case 'failed':
        return { kind: 'applied', video: this.failed(event.errorCode, event.reason, props.now) };
    }
  }

  /** Ends processing without a package, e.g. when the video could not be queued. */
  fail(props: FailureProps): Result<Video, InvalidVideoTransitionError> {
    if (PROCESSING_FINISHED.includes(this.state.status)) {
      return err(new InvalidVideoTransitionError(this.state.status, 'fail'));
    }
    return ok(this.failed(props.errorCode, props.reason, props.now));
  }

  /** Where the frames package can be downloaded from, if anywhere. */
  downloadAvailability(now: Date): DownloadAvailability {
    const { status, resultKey, expiresAt } = this.state;
    if (status === 'EXPIRED' || status === 'DELETED') {
      return { kind: 'gone' };
    }
    if (status !== 'DONE' || resultKey === null || expiresAt === null) {
      return { kind: 'not_ready' };
    }
    if (expiresAt.getTime() <= now.getTime()) {
      // The sweep has not run yet, but the retention window is over.
      return { kind: 'gone' };
    }
    return { kind: 'available', resultKey };
  }

  /**
   * Objects a purge must remove. The original is included even though the
   * worker deletes it: deleting a missing object is harmless, and this also
   * sweeps an original the worker failed to delete.
   */
  objectKeysToPurge(): readonly string[] {
    return this.state.resultKey === null
      ? [this.state.sourceKey]
      : [this.state.sourceKey, this.state.resultKey];
  }

  /** Ends the retention window of a finished package. Callers purge the objects first. */
  expire(now: Date): Result<Video, InvalidVideoTransitionError> {
    const { status, expiresAt } = this.state;
    if (status !== 'DONE' || expiresAt === null || expiresAt.getTime() > now.getTime()) {
      return err(new InvalidVideoTransitionError(status, 'expire'));
    }
    return ok(this.next(now, { status: 'EXPIRED', resultKey: null }));
  }

  /**
   * Deletes at the owner's request. Callers purge the objects first; the
   * metadata stays as the minimal history.
   */
  delete(now: Date): Result<Video, InvalidVideoTransitionError> {
    if (!DELETABLE.includes(this.state.status)) {
      return err(new InvalidVideoTransitionError(this.state.status, 'delete'));
    }
    return ok(this.next(now, { status: 'DELETED', resultKey: null }));
  }

  get id(): VideoId {
    return this.state.id;
  }

  get ownerId(): OwnerId {
    return this.state.ownerId;
  }

  get originalFileName(): FileName {
    return this.state.originalFileName;
  }

  get contentType(): string {
    return this.state.contentType;
  }

  get sizeBytes(): number {
    return this.state.sizeBytes;
  }

  get sourceKey(): string {
    return this.state.sourceKey;
  }

  get resultKey(): string | null {
    return this.state.resultKey;
  }

  get frameCount(): number | null {
    return this.state.frameCount;
  }

  get status(): VideoStatus {
    return this.state.status;
  }

  get failureReason(): string | null {
    return this.state.failureReason;
  }

  get expiresAt(): Date | null {
    return this.state.expiresAt;
  }

  get createdAt(): Date {
    return this.state.createdAt;
  }

  get updatedAt(): Date {
    return this.state.updatedAt;
  }

  get version(): number {
    return this.state.version;
  }

  toJSON(): PersistedVideo {
    return { ...this.state };
  }

  private failed(errorCode: string, reason: string, now: Date): Video {
    return this.next(now, {
      status: 'FAILED',
      errorCode: errorCode.slice(0, ERROR_CODE_MAX_LENGTH),
      failureReason: reason,
    });
  }

  private next(now: Date, changes: Partial<VideoState>): Video {
    return new Video({ ...this.state, ...changes, updatedAt: now });
  }
}
