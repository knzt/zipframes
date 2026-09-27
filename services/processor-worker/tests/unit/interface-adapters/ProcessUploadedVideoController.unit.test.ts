import type { VideoUploadedEvent } from '@zipframes/schemas/video-service';
import { describe, expect, it, vi } from 'vitest';

import { ProcessUploadedVideoController } from '../../../src/interface-adapters/ProcessUploadedVideoController.js';
import type { ProcessUploadedVideoUseCase } from '../../../src/application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';

const event: VideoUploadedEvent = {
  eventId: '33333333-3333-4333-8333-333333333333',
  eventType: 'video.uploaded',
  version: 1,
  occurredAt: '2026-09-22T12:00:00.000Z',
  correlationId: '22222222-2222-4222-8222-222222222222',
  payload: {
    videoId: '11111111-1111-4111-8111-111111111111',
    ownerId: 'user-1',
    sourceKey: 'uploads/user-1/11111111-1111-4111-8111-111111111111',
    originalFileName: 'clip.mp4',
    sizeBytes: 1024,
  },
};

const controllerFor = (
  execute: ProcessUploadedVideoUseCase['execute'],
): ProcessUploadedVideoController =>
  new ProcessUploadedVideoController({ execute } as unknown as ProcessUploadedVideoUseCase);

describe('ProcessUploadedVideoController', () => {
  it('maps the decoded envelope onto the use case and returns its result', async () => {
    const execute = vi.fn(async () => 'frames_packaged' as const);
    const controller = controllerFor(execute);

    const result = await controller.handle({ event, attempt: 2 });

    expect(result).toBe('frames_packaged');
    expect(execute).toHaveBeenCalledWith({
      videoId: event.payload.videoId,
      ownerId: event.payload.ownerId,
      sourceKey: event.payload.sourceKey,
      originalFileName: event.payload.originalFileName,
      sizeBytes: event.payload.sizeBytes,
      attempt: 2,
      correlationId: event.correlationId,
    });
  });

  it('lets a retryable failure leave the controller for the consumer', async () => {
    const execute = vi.fn(async () => {
      throw new Error('storage down');
    });
    const controller = controllerFor(execute);

    await expect(controller.handle({ event, attempt: 1 })).rejects.toThrow('storage down');
  });
});
