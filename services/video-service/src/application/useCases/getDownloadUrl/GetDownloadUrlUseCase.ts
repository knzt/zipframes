import { ApplicationError, ConflictError, err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import type { StorageUrlSigner } from '../../interfaces/gateways/StorageUrlSigner.js';
import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';
import { VideoNotFoundError } from '../../errors/VideoNotFoundError.js';
import type {
  GetDownloadUrlUseCaseError,
  GetDownloadUrlUseCaseInput,
  GetDownloadUrlUseCaseOutput,
} from './getDownloadUrl.dto.js';

const GONE_STATUS = 410;

/** `clip.final.mp4` is saved as `clip.final-frames.zip`. */
const downloadFileNameOf = (originalFileName: string): string =>
  `${originalFileName.replace(/\.[^.]+$/u, '')}-frames.zip`;

export class GetDownloadUrlUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly storageUrlSigner: StorageUrlSigner,
    private readonly downloadUrlTtlSeconds: number,
  ) {}

  async execute(
    query: GetDownloadUrlUseCaseInput,
  ): Promise<Result<GetDownloadUrlUseCaseOutput, GetDownloadUrlUseCaseError>> {
    const video = await this.videoRepository.findByIdForOwner(query.videoId, query.ownerId);
    if (video === null) {
      return err(new VideoNotFoundError());
    }

    const availability = video.downloadAvailability(new Date());
    switch (availability.kind) {
      case 'not_ready':
        return err(new ConflictError('VIDEO_NOT_READY', 'the frames package is not ready'));
      case 'gone':
        return err(
          new ApplicationError(
            'VIDEO_GONE',
            'the frames package is no longer available; upload the video again',
            {},
            GONE_STATUS,
          ),
        );
      case 'available': {
        const download = await this.storageUrlSigner.signDownload({
          key: availability.resultKey,
          downloadFileName: downloadFileNameOf(video.originalFileName),
          expiresInSeconds: this.downloadUrlTtlSeconds,
        });
        return ok({
          videoId: video.id,
          downloadUrl: download.url,
          expiresInSeconds: download.expiresInSeconds,
        });
      }
    }
  }
}
