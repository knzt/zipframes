import type { UserDeletedPayload, UserRegisteredPayload } from '@zipframes/schemas/auth-service';

export interface EventPublisherUserRegistered {
  readonly eventType: 'user.registered';
  readonly correlationId: string;
  readonly payload: UserRegisteredPayload;
}

export interface EventPublisherUserDeleted {
  readonly eventType: 'user.deleted';
  readonly correlationId: string;
  readonly payload: UserDeletedPayload;
}

export type EventPublisherInput = EventPublisherUserRegistered | EventPublisherUserDeleted;

export interface EventPublisher {
  readonly publish: (input: EventPublisherInput) => Promise<void>;
}
