import type { PrismaClient } from '@prisma/client';

import type { EventOutbox } from '../../application/interfaces/gateways/EventOutbox.js';
import type { Clock } from '../../application/interfaces/services/Clock.js';
import type { IdGenerator } from '../../application/interfaces/services/IdGenerator.js';
import type { UserRegistered } from '../../domain/events/userRegistered.js';
import { prismaConnection } from '../repositories/prisma/prismaTransaction.js';

export const USER_REGISTERED_AGGREGATE_TYPE = 'User';
export const USER_REGISTERED_EVENT_TYPE = 'user.registered';
export const USER_REGISTERED_VERSION = 1;

export interface UserRegisteredOutboxRow {
  readonly id: string;
  readonly aggregateType: typeof USER_REGISTERED_AGGREGATE_TYPE;
  readonly aggregateId: string;
  readonly eventType: typeof USER_REGISTERED_EVENT_TYPE;
  readonly version: typeof USER_REGISTERED_VERSION;
  readonly payload: {
    readonly userId: string;
    readonly name: string;
    readonly email: string;
  };
  readonly correlationId: string;
  readonly occurredAt: Date;
}

/**
 * Maps the domain event onto outbox columns. The use case never sees this
 * shape: envelope fields (row id, aggregate type, version) stay here.
 */
export const toUserRegisteredOutboxRow = (
  event: UserRegistered,
  meta: { readonly id: string; readonly correlationId: string; readonly occurredAt: Date },
): UserRegisteredOutboxRow => ({
  id: meta.id,
  aggregateType: USER_REGISTERED_AGGREGATE_TYPE,
  aggregateId: event.userId,
  eventType: USER_REGISTERED_EVENT_TYPE,
  version: USER_REGISTERED_VERSION,
  payload: {
    userId: event.userId,
    name: event.name,
    email: event.email,
  },
  correlationId: meta.correlationId,
  occurredAt: meta.occurredAt,
});

export class PrismaEventOutbox implements EventOutbox {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async record(event: UserRegistered, correlationId: string): Promise<void> {
    const row = toUserRegisteredOutboxRow(event, {
      id: this.ids.next(),
      correlationId,
      occurredAt: this.clock.now(),
    });

    await prismaConnection(this.prisma).outboxEvent.create({
      data: {
        id: row.id,
        aggregateType: row.aggregateType,
        aggregateId: row.aggregateId,
        eventType: row.eventType,
        version: row.version,
        payload: row.payload,
        correlationId: row.correlationId,
        occurredAt: row.occurredAt,
      },
    });
  }
}
