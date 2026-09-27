import { UnavailableError } from '@zipframes/core';

import type { IgnoredProcessingReason, ProcessingEvent } from '../../../domain/entities/video.js';
import type { VideoStatus } from '../../../domain/valueObjects/videoStatus.js';
import type { VideoListCache } from '../../interfaces/gateways/VideoListCache.js';
import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';

export interface ApplyProcessingEventUseCaseInput {
  readonly videoId: string;
  readonly event: ProcessingEvent;
}

/**
 * How the event ended, discriminated by `kind` like the domain's own
 * {@link ProcessingEventOutcome}. Infrastructure faults are not a kind of
 * result here: they are thrown so the message is retried.
 */
export type ApplyProcessingEventUseCaseOutput =
  | { readonly kind: 'applied'; readonly status: VideoStatus }
  | {
      readonly kind: 'ignored';
      readonly reason: Exclude<IgnoredProcessingReason, 'not_queued'>;
    }
  | { readonly kind: 'unknown_video' };

/**
 * Moves the video along what the worker reported. Idempotent by the state
 * machine alone: a redelivered or late event produces no valid transition
 * and is ignored, so no deduplication table is needed.
 */
export class ApplyProcessingEventUseCase {
  constructor(
    private readonly videoRepository: VideoRepository,
    private readonly videoListCache: VideoListCache,
    private readonly retentionMs: number,
  ) {}

  async execute(
    input: ApplyProcessingEventUseCaseInput,
  ): Promise<ApplyProcessingEventUseCaseOutput> {
    const video = await this.videoRepository.findById(input.videoId);
    if (video === null) {
      // The row exists from the upload request on, well before anything is
      // queued, so retrying cannot make an unknown id appear.
      return { kind: 'unknown_video' };
    }

    const result = video.applyProcessingEvent(input.event, {
      retentionMs: this.retentionMs,
      now: new Date(),
    });
    if (result.kind === 'ignored') {
      if (result.reason === 'not_queued') {
        // `video.uploaded` leaves just before the `QUEUED` commit, so a fast
        // worker can answer first. Retrying with backoff gives the commit
        // time to land; if it never does, the message ends in the DLQ.
        throw new UnavailableError('VIDEO_NOT_QUEUED_YET', 'the video is not queued yet');
      }
      return { kind: 'ignored', reason: result.reason };
    }

    await this.videoRepository.save(result.video);
    await this.videoListCache.invalidate(video.ownerId);
    return { kind: 'applied', status: result.video.status };
  }
}
