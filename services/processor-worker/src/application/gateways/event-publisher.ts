export interface ProcessingStartedEvent {
  readonly eventType: 'video.processing.started';
  readonly correlationId: string;
  readonly payload: {
    readonly videoId: string;
    readonly attempt: number;
  };
}

export interface VideoProcessedEvent {
  readonly eventType: 'video.processed';
  readonly correlationId: string;
  readonly payload: {
    readonly videoId: string;
    /** AsyncAPI field name for the frames-package object key. */
    readonly resultKey: string;
    readonly frameCount: number;
    readonly durationMs: number;
  };
}

export interface VideoFailedEvent {
  readonly eventType: 'video.failed';
  readonly correlationId: string;
  readonly payload: {
    readonly videoId: string;
    readonly ownerId: string;
    readonly errorCode: string;
    readonly reason: string;
    readonly attempts: number;
  };
}

export type ProcessingPublication = ProcessingStartedEvent | VideoProcessedEvent | VideoFailedEvent;

export interface EventPublisher {
  readonly publish: (event: ProcessingPublication) => Promise<void>;
}
