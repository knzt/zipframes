import { randomUUID } from 'node:crypto';

import { err, ok, ValidationError } from '@zipframes/core';
import type { Brand, Result } from '@zipframes/core';

import { InvalidVideoTransitionError, UploadNotFoundError } from '../errors/videoErrors.js';
import { framesPackageKeyFor, sourceKeyFor } from '../policies/storageKeys.js';
import { asFileName, createFileName, type FileName } from '../valueObjects/fileName.js';
import { DELETABLE, PROCESSING_FINISHED, type VideoStatus } from '../valueObjects/videoStatus.js';

export type VideoId = Brand<string, 'VideoId'>;
export type OwnerId = Brand<string, 'OwnerId'>;

/** Compile-time brands only; a stored or freshly generated UUID is already valid. */
export const brandVideoId = (id: string): VideoId => id as VideoId;
export const brandOwnerId = (id: string): OwnerId => id as OwnerId;

const ERROR_CODE_MAX_LENGTH = 50;
const CONTENT_TYPE_MAX_LENGTH = 100;
const CONTENT_TYPE = /^[\w.+-]+\/[\w.+-]+$/u;

export interface RequestUploadProps {
  readonly id?: string;
  readonly ownerId: string;
  readonly originalFileName: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly maxSizeBytes: number;
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
  readonly sourcePurgedAt: Date | null;
  readonly resultPurgedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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
  'processing_finished' | 'not_queued' | 'already_processing' | 'foreign_result_key';

export type ProcessingEventOutcome =
  | { readonly kind: 'applied'; readonly video: Video }
  | { readonly kind: 'ignored'; readonly reason: IgnoredProcessingReason };

export type DownloadAvailability =
  | { readonly kind: 'available'; readonly resultKey: string }
  | { readonly kind: 'not_ready' }
  | { readonly kind: 'gone' };

const validateSize = (sizeBytes: number, maxSizeBytes: number): ValidationError | null => {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    return new ValidationError('INVALID_FILE_SIZE', 'file size must be a positive number of bytes');
  }
  if (sizeBytes > maxSizeBytes) {
    return new ValidationError(
      'FILE_TOO_LARGE',
      `file size must be at most ${String(maxSizeBytes)} bytes`,
    );
  }
  return null;
};

/**
 * The Video aggregate: one upload and everything that happens to it until the
 * frames package expires or the owner deletes it.
 *
 * Instances are immutable. Every transition returns a new `Video` with
 * `updatedAt` moved to `now`; `version` is the one the row was read with, so
 * the repository can detect a concurrent write.
 */
export class Video {
  private constructor(private readonly state: VideoState) {}

  /** Validates what the owner declared and opens a video waiting for its file. */
  static requestUpload(props: RequestUploadProps): Result<Video, ValidationError> {
    const fileName = createFileName(props.originalFileName);
    if (!fileName.ok) {
      return fileName;
    }

    const contentType = props.contentType.trim();
    if (contentType.length > CONTENT_TYPE_MAX_LENGTH || !CONTENT_TYPE.test(contentType)) {
      return err(new ValidationError('INVALID_CONTENT_TYPE', 'content type must be a MIME type'));
    }

    const sizeError = validateSize(props.sizeBytes, props.maxSizeBytes);
    if (sizeError !== null) {
      return err(sizeError);
    }

    const id = brandVideoId(props.id ?? randomUUID());
    const ownerId = brandOwnerId(props.ownerId);
    return ok(
      new Video({
        id,
        ownerId,
        originalFileName: fileName.value,
        contentType,
        sizeBytes: props.sizeBytes,
        sourceKey: sourceKeyFor(ownerId, id),
        resultKey: null,
        frameCount: null,
        status: 'AWAITING_UPLOAD',
        errorCode: null,
        failureReason: null,
        expiresAt: null,
        sourcePurgedAt: null,
        resultPurgedAt: null,
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
   * Accepts the file the owner put in storage and queues the video. The size
   * is checked again against what the storage actually holds, which also
   * becomes the recorded size.
   */
  confirmUpload(props: {
    readonly storedObject: { readonly sizeBytes: number } | null;
    readonly maxSizeBytes: number;
    readonly now: Date;
  }): Result<Video, InvalidVideoTransitionError | UploadNotFoundError | ValidationError> {
    if (this.state.status !== 'AWAITING_UPLOAD') {
      return err(new InvalidVideoTransitionError(this.state.status, 'confirm the upload of'));
    }
    if (props.storedObject === null) {
      return err(new UploadNotFoundError());
    }
    const sizeError = validateSize(props.storedObject.sizeBytes, props.maxSizeBytes);
    if (sizeError !== null) {
      return err(sizeError);
    }
    return ok(
      this.next(props.now, {
        status: 'QUEUED',
        sizeBytes: props.storedObject.sizeBytes,
      }),
    );
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
    const { status } = this.state;
    if (PROCESSING_FINISHED.includes(status)) {
      return { kind: 'ignored', reason: 'processing_finished' };
    }
    if (status === 'AWAITING_UPLOAD') {
      return { kind: 'ignored', reason: 'not_queued' };
    }

    switch (event.kind) {
      case 'started':
        if (status === 'PROCESSING') {
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
        return {
          kind: 'applied',
          video: this.next(props.now, {
            status: 'FAILED',
            errorCode: event.errorCode.slice(0, ERROR_CODE_MAX_LENGTH),
            failureReason: event.reason,
          }),
        };
    }
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

  /** Objects this video may still hold in storage, which a purge must remove. */
  objectKeysToPurge(): readonly string[] {
    const keys: string[] = [];
    if (this.state.sourcePurgedAt === null) {
      keys.push(this.state.sourceKey);
    }
    if (this.state.resultKey !== null) {
      keys.push(this.state.resultKey);
    }
    return keys;
  }

  /**
   * Ends the retention window of a finished package. Callers purge
   * {@link objectKeysToPurge} first, which also sweeps an original the worker
   * failed to delete.
   */
  expire(now: Date): Result<Video, InvalidVideoTransitionError> {
    const { status, expiresAt } = this.state;
    if (status !== 'DONE' || expiresAt === null || expiresAt.getTime() > now.getTime()) {
      return err(new InvalidVideoTransitionError(status, 'expire'));
    }
    return ok(
      this.next(now, {
        status: 'EXPIRED',
        resultKey: null,
        sourcePurgedAt: this.state.sourcePurgedAt ?? now,
        resultPurgedAt: now,
      }),
    );
  }

  /**
   * Deletes at the owner's request. Callers purge {@link objectKeysToPurge}
   * first; the metadata stays as the minimal history.
   */
  delete(now: Date): Result<Video, InvalidVideoTransitionError> {
    if (!DELETABLE.includes(this.state.status)) {
      return err(new InvalidVideoTransitionError(this.state.status, 'delete'));
    }
    return ok(
      this.next(now, {
        status: 'DELETED',
        resultKey: null,
        sourcePurgedAt: this.state.sourcePurgedAt ?? now,
        resultPurgedAt: this.state.resultKey === null ? this.state.resultPurgedAt : now,
      }),
    );
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

  private next(now: Date, changes: Partial<VideoState>): Video {
    return new Video({ ...this.state, ...changes, updatedAt: now });
  }
}
