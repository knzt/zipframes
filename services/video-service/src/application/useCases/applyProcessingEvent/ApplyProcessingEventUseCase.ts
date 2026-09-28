import type { IgnoredProcessingReason, ProcessingEvent } from '../../../domain/entities/video.js';
import type { VideoStatus } from '../../../domain/valueObjects/videoStatus.js';
import type { VideoListCache } from '../../interfaces/gateways/VideoListCache.js';
import type { VideoRepository } from '../../interfaces/repositories/VideoRepository.js';

/** What the worker reported about one video. */
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
  | { readonly kind: 'ignored'; readonly reason: IgnoredProcessingReason }
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
    report: ApplyProcessingEventUseCaseInput,
  ): Promise<ApplyProcessingEventUseCaseOutput> {
    const video = await this.videoRepository.findById(report.videoId);
    if (video === null) {
      // The video is stored before `video.uploaded` is published, so an
      // unknown id cannot appear later: retrying would not help.
      return { kind: 'unknown_video' };
    }

    const transition = video.applyProcessingEvent(report.event, {
      retentionMs: this.retentionMs,
      now: new Date(),
    });
    if (transition.kind === 'ignored') {
      return { kind: 'ignored', reason: transition.reason };
    }

    await this.videoRepository.save(transition.video);
    await this.videoListCache.invalidate(video.ownerId);
    return { kind: 'applied', status: transition.video.status };
  }
}
