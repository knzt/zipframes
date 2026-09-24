import type {
  VideoFailedPayload,
  VideoProcessedPayload,
  VideoProcessingStartedPayload,
} from '@zipframes/schemas/processor-worker';

export interface ProcessingStartedEvent {
  readonly eventType: 'video.processing.started';
  readonly correlationId: string;
  readonly payload: VideoProcessingStartedPayload;
}

export interface VideoProcessedEvent {
  readonly eventType: 'video.processed';
  readonly correlationId: string;
  readonly payload: VideoProcessedPayload;
}

export interface VideoFailedEvent {
  readonly eventType: 'video.failed';
  readonly correlationId: string;
  readonly payload: VideoFailedPayload;
}

export type ProcessingPublication = ProcessingStartedEvent | VideoProcessedEvent | VideoFailedEvent;

export interface EventPublisher {
  readonly publish: (event: ProcessingPublication) => Promise<void>;
}
