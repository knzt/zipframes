export interface ProcessingStartedEvent {
  readonly eventType: 'video.processing.started';
  readonly correlationId: string;
  readonly payload: {
    readonly videoId: string;
    readonly attempt: number;
  };
}

export interface ProcessedEvent {
  readonly eventType: 'video.processed';
  readonly correlationId: string;
  readonly payload: {
    readonly videoId: string;
    readonly resultKey: string;
    readonly frameCount: number;
    readonly durationMs: number;
  };
}

export interface FailedEvent {
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

export type ProcessingOutboundEvent = ProcessingStartedEvent | ProcessedEvent | FailedEvent;

export interface EventPublisher {
  readonly publish: (event: ProcessingOutboundEvent) => Promise<void>;
}
