import type { ProcessingResult } from '../../domain/valueObjects/processingResult.js';
import type { ProcessUploadedVideoUseCase } from '../useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';
import type { ProcessUploadedVideoRequest } from './processUploadedVideo.types.js';

/**
 * Turns an already decoded `video.uploaded` envelope into the use case call.
 * AMQP settlement stays in the consumer.
 */
export class ProcessUploadedVideoController {
  constructor(private readonly processUploadedVideoUseCase: ProcessUploadedVideoUseCase) {}

  async handle(request: ProcessUploadedVideoRequest): Promise<ProcessingResult> {
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
