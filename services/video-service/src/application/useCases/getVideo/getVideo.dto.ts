import type { Video } from '../../../domain/entities/video.js';
import type { VideoNotFoundError } from '../../errors/VideoNotFoundError.js';

export interface GetVideoUseCaseInput {
  readonly ownerId: string;
  readonly videoId: string;
}

export type GetVideoUseCaseOutput = Video;

export type GetVideoUseCaseError = VideoNotFoundError;
