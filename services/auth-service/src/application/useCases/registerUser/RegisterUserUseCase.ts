import { ConflictError, ValidationError, err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { userRegisteredFrom } from '../../../domain/events/userRegistered.js';
import { User } from '../../../domain/entities/user.js';
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
      return err(new ValidationError(password.error.code, password.error.message));
    }

    const passwordHash = await this.passwordHasher.hash(password.value);
    const now = this.clock.now();

    let user: User;
    try {
      user = new User({
        id: this.idGenerator.next(),
        name: input.name,
        email: input.email,
        passwordHash,
        now,
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        return err(error);
      }
      throw error;
    }

    const existing = await this.userRepository.findByEmail(user.email);
    if (existing !== null) {
      return err(new ConflictError('EMAIL_TAKEN', 'email is already registered'));
    }

    const created = await this.userRepository.create(user);

    await this.publishUserRegistered(input.correlationId, created);

    return ok({
      userId: created.id,
      name: created.name,
      email: created.email,
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
