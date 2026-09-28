import {
  defineMessageHandler,
  type ConsumeHandler,
  type MessageHandlerOptions,
} from '@zipframes/communication';
import { videoFailedEventSchema, type VideoFailedEvent } from '@zipframes/schemas/processor-worker';

import type { NotifyVideoFailedUseCase } from '../../application/useCases/notifyVideoFailed/NotifyVideoFailedUseCase.js';
import type { Notification } from '../../domain/entities/notification.js';

export type VideoFailedHandlerOptions = MessageHandlerOptions<VideoFailedEvent, Notification>;

export class VideoFailedController {
  readonly handle: ConsumeHandler;

  constructor(notifyVideoFailed: NotifyVideoFailedUseCase, options: VideoFailedHandlerOptions) {
    this.handle = defineMessageHandler({
      ...options,
      schema: videoFailedEventSchema,
      handle: (event) => {
        const originalFileName = event.payload.originalFileName;
        const uploadedAt = event.payload.uploadedAt;
        return notifyVideoFailed.execute({
          videoId: event.payload.videoId,
          ownerId: event.payload.ownerId,
          ...(originalFileName === undefined ? {} : { originalFileName }),
          ...(uploadedAt === undefined ? {} : { uploadedAt: new Date(uploadedAt) }),
        });
      },
    });
  }
}
