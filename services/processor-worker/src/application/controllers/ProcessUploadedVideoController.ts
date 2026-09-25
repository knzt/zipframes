import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';

import type { ProcessingResult } from '../../domain/valueObjects/processingResult.js';
import type { ProcessUploadedVideoUseCase } from '../useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';

/**
 * Turns an already decoded `video.uploaded` envelope into the use case call.
 * AMQP settlement stays in the consumer.
 */
export class ProcessUploadedVideoController {
  constructor(private readonly useCase: ProcessUploadedVideoUseCase) {}

  async handle(event: VideoUploadedEvent, attempt: number): Promise<ProcessingResult> {
    return this.useCase.execute({
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
