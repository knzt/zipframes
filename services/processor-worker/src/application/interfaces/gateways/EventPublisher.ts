import type {
  VideoFailedPayload,
  VideoProcessedPayload,
  VideoProcessingStartedPayload,
} from '@zipframes/schemas/processor-worker';

export interface EventPublisherProcessingStarted {
  readonly eventType: 'video.processing.started';
  readonly correlationId: string;
  readonly payload: VideoProcessingStartedPayload;
}

export interface EventPublisherVideoProcessed {
  readonly eventType: 'video.processed';
  readonly correlationId: string;
  readonly payload: VideoProcessedPayload;
}

export interface EventPublisherVideoFailed {
  readonly eventType: 'video.failed';
  readonly correlationId: string;
  readonly payload: VideoFailedPayload;
}

export type EventPublisherInput =
  EventPublisherProcessingStarted | EventPublisherVideoProcessed | EventPublisherVideoFailed;

export interface EventPublisher {
  readonly publish: (input: EventPublisherInput) => Promise<void>;
}
