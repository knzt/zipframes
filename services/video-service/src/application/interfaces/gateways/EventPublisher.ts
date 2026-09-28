import type { VideoUploadedPayload } from '@zipframes/schemas/video-service';

export interface EventPublisherVideoUploaded {
  readonly eventType: 'video.uploaded';
  readonly correlationId: string;
  readonly payload: VideoUploadedPayload;
}

export type EventPublisherInput = EventPublisherVideoUploaded;

export interface EventPublisher {
  /** Resolves once the broker confirmed the message. */
  readonly publish: (input: EventPublisherInput) => Promise<void>;
}
