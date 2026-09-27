import { ConflictError, UnavailableError, err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import type { Video } from '../../../domain/entities/video.js';
import {
  InvalidVideoTransitionError,
  UploadNotFoundError,
} from '../../../domain/errors/videoErrors.js';
import { videoQueuedFrom } from '../../../domain/events/videoQueued.js';
import type { EventPublisher } from '../../interfaces/gateways/EventPublisher.js';
import type { ObjectStorage } from '../../interfaces/gateways/ObjectStorage.js';
import type { VideoListCache } from '../../interfaces/gateways/VideoListCache.js';
import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';
import { VideoNotFoundError } from '../../errors/VideoNotFoundError.js';
import type {
  ConfirmUploadUseCaseError,
  ConfirmUploadUseCaseInput,
  ConfirmUploadUseCaseOutput,
} from './confirmUpload.dto.js';

/**
 * Queues an uploaded video for processing.
 *
 * `video.uploaded` is published inside the transaction that writes `QUEUED`:
 * when the broker does not confirm, nothing is stored and the caller gets a
 * 503 to retry. Publishing after the commit would instead leave a video
 * `QUEUED` forever with no worker ever told about it.
 */
export class ConfirmUploadUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly objectStorage: ObjectStorage,
    private readonly eventPublisher: EventPublisher,
    private readonly videoListCache: VideoListCache,
    private readonly maxSizeBytes: number,
  ) {}

  async execute(
    confirmation: ConfirmUploadUseCaseInput,
  ): Promise<Result<ConfirmUploadUseCaseOutput, ConfirmUploadUseCaseError>> {
    const video = await this.videoRepository.findByOwnerId(
      confirmation.ownerId,
      confirmation.videoId,
    );
    if (video === null) {
      return err(new VideoNotFoundError());
    }

    const queued = video.confirmUpload({
      storedObject: await this.objectStorage.head(video.sourceKey),
      maxSizeBytes: this.maxSizeBytes,
      now: new Date(),
    });
    if (!queued.ok) {
      return err(await this.rejection(video, queued.error));
    }

    await this.videoRepository.save(queued.value, () =>
      this.publishVideoUploaded(queued.value, confirmation.correlationId),
    );
    await this.videoListCache.invalidate(video.ownerId);

    return ok({ videoId: video.id, status: 'QUEUED' as const });
  }

  private async rejection(
    video: Video,
    error: InvalidVideoTransitionError | UploadNotFoundError | ConfirmUploadUseCaseError,
  ): Promise<ConfirmUploadUseCaseError> {
    if (error instanceof InvalidVideoTransitionError) {
      return new ConflictError('VIDEO_NOT_AWAITING_UPLOAD', 'the upload was already confirmed');
    }
    if (error instanceof UploadNotFoundError) {
      return new ConflictError(error.code, error.message);
    }
    // The stored file broke the size rule: it will never be processed, so
    // it does not stay in storage either. The video keeps waiting for a
    // valid upload.
    await this.objectStorage.deleteObject(video.sourceKey);
    return error;
  }

  private async publishVideoUploaded(video: Video, correlationId: string): Promise<void> {
    try {
      await this.eventPublisher.publish({
        eventType: 'video.uploaded',
        correlationId,
        payload: videoQueuedFrom(video),
      });
    } catch (error) {
      throw new UnavailableError('VIDEO_NOT_QUEUED', 'the video could not be queued, try again', {
        cause: error,
      });
    }
  }
}
