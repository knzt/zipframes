export interface EventPublisher {
  readonly publish: (input: {
    readonly eventType: string;
    readonly correlationId: string;
    readonly payload: Record<string, unknown>;
  }) => Promise<void>;
}
