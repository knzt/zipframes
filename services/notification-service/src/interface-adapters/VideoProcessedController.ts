import {
  defineMessageHandler,
  type ConsumeHandler,
  type MessageHandlerOptions,
} from '@zipframes/communication';
import {
  videoProcessedEventSchema,
  type VideoProcessedEvent,
} from '@zipframes/schemas/processor-worker';

import type { Notification } from '../domain/entities/notification.js';
import type { NotifyVideoProcessedUseCase } from '../application/useCases/notifyVideoProcessed/NotifyVideoProcessedUseCase.js';

export type VideoProcessedHandlerOptions = MessageHandlerOptions<
  VideoProcessedEvent,
  Notification | null
>;

export class VideoProcessedController {
  readonly handle: ConsumeHandler;

  constructor(
    notifyVideoProcessed: NotifyVideoProcessedUseCase,
    options: VideoProcessedHandlerOptions,
  ) {
    this.handle = defineMessageHandler({
      ...options,
      schema: videoProcessedEventSchema,
      handle: (event) => {
        const ownerId = event.payload.ownerId;
        const originalFileName = event.payload.originalFileName;
        return notifyVideoProcessed.execute({
          videoId: event.payload.videoId,
          resultKey: event.payload.resultKey,
          frameCount: event.payload.frameCount,
          ...(ownerId === undefined ? {} : { ownerId }),
          ...(originalFileName === undefined ? {} : { originalFileName }),
        });
      },
    });
  }
}
