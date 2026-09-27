import type { Video } from '../../../domain/entities/video.js';

export interface ListUserVideosUseCaseInput {
  readonly ownerId: string;
  readonly limit: number;
  /** `createdAt` of the last item of the previous page. */
  readonly before?: Date;
}

export interface ListUserVideosUseCaseOutput {
  readonly items: readonly Video[];
}

export type ListUserVideosUseCaseError = never;
