import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { Video } from '../../../domain/entities/video.js';
import type { StorageUrlSigner } from '../../interfaces/gateways/StorageUrlSigner.js';
import type { VideoListCache } from '../../interfaces/gateways/VideoListCache.js';
import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';
import type {
  RequestUploadUseCaseError,
  RequestUploadUseCaseInput,
  RequestUploadUseCaseOutput,
} from './requestUpload.dto.js';

/**
 * Opens a video waiting for its file and hands back a URL the client uploads
 * to directly. Nothing is queued yet: that only happens on confirmation.
 */
export class RequestUploadUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly storageUrlSigner: StorageUrlSigner,
    private readonly videoListCache: VideoListCache,
    private readonly maxSizeBytes: number,
    private readonly uploadUrlTtlSeconds: number,
  ) {}

  async execute(
    request: RequestUploadUseCaseInput,
  ): Promise<Result<RequestUploadUseCaseOutput, RequestUploadUseCaseError>> {
    const video = Video.requestUpload({
      ownerId: request.ownerId,
      originalFileName: request.originalFileName,
      contentType: request.contentType,
      sizeBytes: request.sizeBytes,
      maxSizeBytes: this.maxSizeBytes,
      now: new Date(),
    });
    if (!video.ok) {
      return err(video.error);
    }

    await this.videoRepository.create(video.value);
    await this.videoListCache.invalidate(video.value.ownerId);

    const upload = await this.storageUrlSigner.signUpload({
      key: video.value.sourceKey,
      contentType: video.value.contentType,
      sizeBytes: video.value.sizeBytes,
      expiresInSeconds: this.uploadUrlTtlSeconds,
    });

    return ok({
      videoId: video.value.id,
      uploadUrl: upload.url,
      sourceKey: video.value.sourceKey,
      expiresInSeconds: upload.expiresInSeconds,
    });
  }
}
