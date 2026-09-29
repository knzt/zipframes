import { ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import type { EventPublisher } from '../../interfaces/gateways/EventPublisher.js';
import type { UserRepository } from '../../interfaces/repositories/UserRepository.js';
import type {
  DeleteAccountUseCaseError,
  DeleteAccountUseCaseInput,
  DeleteAccountUseCaseOutput,
} from './deleteAccount.dto.js';

/**
 * Deletes the caller's own account and tells the rest of the system with
 * `user.deleted`, so video-service and notifier-service can remove what
 * they hold for this user. The row is deleted first: publishing after it is
 * confirmed gone is what makes a retried request safe.
 */
export class DeleteAccountUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly eventPublisher: EventPublisher,
    private readonly onPublishFailed?: (
      error: unknown,
      details: { readonly userId: string; readonly correlationId: string },
    ) => void,
  ) {}

  async execute(
    deletion: DeleteAccountUseCaseInput,
  ): Promise<Result<DeleteAccountUseCaseOutput, DeleteAccountUseCaseError>> {
    await this.userRepository.deleteById(deletion.userId);
    await this.publishUserDeleted(deletion.correlationId, deletion.userId);
    return ok(undefined);
  }

  private async publishUserDeleted(correlationId: string, userId: string): Promise<void> {
    try {
      await this.eventPublisher.publish({
        eventType: 'user.deleted',
        correlationId,
        payload: { userId },
      });
    } catch (error) {
      this.onPublishFailed?.(error, { userId, correlationId });
    }
  }
}
