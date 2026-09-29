import type { Video } from '../../../domain/entities/video.js';
import type { ListableVideoStatus } from '../../../domain/valueObjects/videoStatus.js';

export interface ListUserVideosUseCaseInput {
  readonly ownerId: string;
  readonly limit: number;
  /** `createdAt` of the last item of the previous page. */
  readonly before?: Date;
  /** Only videos in this status. */
  readonly status?: ListableVideoStatus;
}

export interface ListUserVideosUseCaseOutput {
  readonly items: readonly Video[];
}

export type ListUserVideosUseCaseError = never;
