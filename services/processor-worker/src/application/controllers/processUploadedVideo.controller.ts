import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';

import type { ProcessingResult } from '../../domain/valueObjects/processingResult.js';
import type { ProcessUploadedVideo } from '../useCases/processUploadedVideo/processUploadedVideo.dto.js';

export interface ProcessUploadedVideoControllerDependencies {
  readonly processUploadedVideo: ProcessUploadedVideo;
}

/**
 * Turns an already decoded `video.uploaded` envelope into the use case call.
 * AMQP settlement stays in the consumer.
 */
export const makeProcessUploadedVideoController =
  (deps: ProcessUploadedVideoControllerDependencies) =>
  async (event: VideoUploadedEvent, attempt: number): Promise<ProcessingResult> =>
    deps.processUploadedVideo({
      videoId: event.payload.videoId,
      ownerId: event.payload.ownerId,
      sourceKey: event.payload.sourceKey,
      originalFileName: event.payload.originalFileName,
      sizeBytes: event.payload.sizeBytes,
      attempt,
      correlationId: event.correlationId,
    });
