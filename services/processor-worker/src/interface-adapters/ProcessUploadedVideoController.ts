import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';

import type { ProcessUploadedVideoUseCase } from '../application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';
import type { ProcessUploadedVideoUseCaseOutput } from '../application/useCases/processUploadedVideo/processUploadedVideo.types.js';

export interface ProcessUploadedVideoControllerRequest {
  readonly event: VideoUploadedEvent;
  readonly attempt: number;
}

export type ProcessUploadedVideoControllerResponse = ProcessUploadedVideoUseCaseOutput;

/**
 * Turns an already decoded `video.uploaded` envelope into the use case call.
 * AMQP settlement stays in the consumer.
 */
export class ProcessUploadedVideoController {
  constructor(private readonly processUploadedVideoUseCase: ProcessUploadedVideoUseCase) {}

  handle(
    request: ProcessUploadedVideoControllerRequest,
  ): Promise<ProcessUploadedVideoControllerResponse> {
    const { event, attempt } = request;
    return this.processUploadedVideoUseCase.execute({
      videoId: event.payload.videoId,
      ownerId: event.payload.ownerId,
      sourceKey: event.payload.sourceKey,
      originalFileName: event.payload.originalFileName,
      sizeBytes: event.payload.sizeBytes,
      attempt,
      correlationId: event.correlationId,
    });
  }
}
