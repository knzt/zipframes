import { ConflictError, ValidationError, err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { userRegisteredFrom } from '../../../domain/events/userRegistered.js';
import { registerUser, type User } from '../../../domain/entities/user.js';
import { createPassword } from '../../../domain/valueObjects/password.js';
import type { EventPublisher } from '../../interfaces/gateways/EventPublisher.js';
import type { UserRepository } from '../../interfaces/repositories/UserRepository.js';
import type { Clock } from '../../interfaces/services/Clock.js';
import type { IdGenerator } from '../../interfaces/services/IdGenerator.js';
import type { PasswordHasher } from '../../interfaces/services/PasswordHasher.js';
import type {
  RegisterUserUseCaseError,
  RegisterUserUseCaseInput,
  RegisterUserUseCaseOutput,
} from './registerUser.types.js';

export class RegisterUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
    private readonly eventPublisher: EventPublisher,
    private readonly onPublishFailed?: (
      error: unknown,
      details: { readonly userId: string; readonly correlationId: string },
    ) => void,
  ) {}

  async execute(
    input: RegisterUserUseCaseInput,
  ): Promise<Result<RegisterUserUseCaseOutput, RegisterUserUseCaseError>> {
    const password = createPassword(input.password);
    if (!password.ok) {
      return err(new ValidationError('INVALID_INPUT', password.error.message));
    }

    const passwordHash = await this.passwordHasher.hash(password.value);
    const now = this.clock.now();

    const user = registerUser({
      id: this.idGenerator.next(),
      name: input.name,
      email: input.email,
      passwordHash,
      now,
    });
    if (!user.ok) {
      return err(new ValidationError('INVALID_INPUT', user.error.message));
    }

    const existing = await this.userRepository.findByEmail(user.value.email);
    if (existing !== null) {
      return err(new ConflictError('EMAIL_TAKEN', 'email is already registered'));
    }

    const saved = await this.userRepository.save(user.value);
    if (!saved.ok) {
      return err(saved.error);
    }

    await this.publishUserRegistered(input.correlationId, user.value);

    return ok({
      userId: user.value.id,
      name: user.value.name,
      email: user.value.email,
    });
  }

  private async publishUserRegistered(correlationId: string, user: User): Promise<void> {
    try {
      await this.eventPublisher.publish({
        eventType: 'user.registered',
        correlationId,
        payload: userRegisteredFrom(user),
      });
    } catch (error) {
      this.onPublishFailed?.(error, {
        userId: user.id,
        correlationId,
      });
    }
  }
}
