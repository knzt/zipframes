import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';

import type {
  ProcessUploadedVideoUseCase,
  ProcessUploadedVideoUseCaseOutput,
} from '../application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';

export interface ProcessUploadedVideoControllerRequest {
  readonly event: VideoUploadedEvent;
  readonly attempt: number;
}

export type ProcessUploadedVideoControllerResponse = ProcessUploadedVideoUseCaseOutput;

export interface ProcessUploadedVideoControllerDeps {
  readonly processUploadedVideoUseCase: ProcessUploadedVideoUseCase;
}

/**
 * Turns an already decoded `video.uploaded` envelope into the use case call.
 * AMQP settlement stays in the consumer.
 */
export class ProcessUploadedVideoController {
  constructor(private readonly deps: ProcessUploadedVideoControllerDeps) {}

  handle(
    request: ProcessUploadedVideoControllerRequest,
  ): Promise<ProcessUploadedVideoControllerResponse> {
    const { event, attempt } = request;
    return this.deps.processUploadedVideoUseCase.execute({
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
