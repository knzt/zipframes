import { ApplicationError, UnavailableError, err, ok } from '@zipframes/core';
import type { Result, ValidationError } from '@zipframes/core';

import { newVideoId, Video } from '../../../domain/entities/video.js';
import { videoQueuedFrom } from '../../../domain/events/videoQueued.js';
import { sourceKeyFor } from '../../../domain/policies/storageKeys.js';
import { createVideoFile } from '../../../domain/valueObjects/videoFile.js';
import type { EventPublisher } from '../../interfaces/gateways/EventPublisher.js';
import type { ObjectStorage } from '../../interfaces/gateways/ObjectStorage.js';
import type { VideoListCache } from '../../interfaces/gateways/VideoListCache.js';
import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';
import type {
  UploadVideoUseCaseError,
  UploadVideoUseCaseInput,
  UploadVideoUseCaseOutput,
} from './uploadVideo.dto.js';

const PAYLOAD_TOO_LARGE = 413;

/** A file above the limit is a 413, not a generic validation failure. */
const toUploadError = (error: ValidationError): UploadVideoUseCaseError =>
  error.code === 'FILE_TOO_LARGE'
    ? new ApplicationError(error.code, error.message, {}, PAYLOAD_TOO_LARGE)
    : error;

/**
 * Receives a video in one request: stores the file, records the video as
 * `QUEUED` and tells the worker with `video.uploaded`.
 *
 * The video is written before the event is published, so the worker never
 * reports on a video this service does not know. If the broker then refuses
 * the event, the video is marked `FAILED` with the reason and its file is
 * removed: the owner sees why, instead of a video stuck in the queue.
 */
export class UploadVideoUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly objectStorage: ObjectStorage,
    private readonly eventPublisher: EventPublisher,
    private readonly videoListCache: VideoListCache,
    private readonly maxSizeBytes: number,
  ) {}

  async execute(
    upload: UploadVideoUseCaseInput,
  ): Promise<Result<UploadVideoUseCaseOutput, UploadVideoUseCaseError>> {
    const file = createVideoFile(upload.originalFileName, upload.contentType);
    if (!file.ok) {
      return err(file.error);
    }

    const videoId = newVideoId();
    const sourceKey = sourceKeyFor(upload.ownerId, videoId);
    const stored = await this.objectStorage.upload(
      sourceKey,
      upload.content,
      file.value.contentType,
    );

    const received = Video.receive({
      id: videoId,
      ownerId: upload.ownerId,
      file: file.value,
      sizeBytes: stored.sizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      now: new Date(),
    });
    if (!received.ok) {
      await this.objectStorage.deleteObject(sourceKey);
      return err(toUploadError(received.error));
    }

    const queued = await this.videoRepository.save(received.value);
    await this.publishVideoUploaded(queued, upload.correlationId);
    await this.videoListCache.invalidate(queued.ownerId);

    return ok({ videoId: queued.id, status: 'QUEUED' as const });
  }

  private async publishVideoUploaded(video: Video, correlationId: string): Promise<void> {
    try {
      await this.eventPublisher.publish({
        eventType: 'video.uploaded',
        correlationId,
        payload: videoQueuedFrom(video),
      });
    } catch (error) {
      await this.giveUp(video);
      throw new UnavailableError('VIDEO_NOT_QUEUED', 'the video could not be queued, try again', {
        cause: error,
      });
    }
  }

  /** The worker will never hear of this video: record why and drop the file. */
  private async giveUp(video: Video): Promise<void> {
    const failed = video.fail({
      errorCode: 'VIDEO_NOT_QUEUED',
      reason: 'the video could not be queued for processing; upload it again',
      now: new Date(),
    });
    if (failed.ok) {
      await this.videoRepository.save(failed.value);
    }
    await this.objectStorage.deleteObject(video.sourceKey);
    await this.videoListCache.invalidate(video.ownerId);
  }
}
