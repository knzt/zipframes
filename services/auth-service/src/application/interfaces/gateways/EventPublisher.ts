import type { UserRegisteredPayload } from '@zipframes/schemas/auth-service';

export interface EventPublisherUserRegistered {
  readonly eventType: 'user.registered';
  readonly correlationId: string;
  readonly payload: UserRegisteredPayload;
}

export type EventPublisherInput = EventPublisherUserRegistered;

export interface EventPublisher {
  readonly publish: (input: EventPublisherInput) => Promise<void>;
}
