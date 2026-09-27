import { randomUUID } from 'node:crypto';

import { ConflictError, ValidationError, err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';

import { userRegisteredFrom } from '../../../domain/events/userRegistered.js';
import { User } from '../../../domain/entities/user.js';
import { createPassword } from '../../../domain/valueObjects/password.js';
import type { EventPublisher } from '../../interfaces/gateways/EventPublisher.js';
import type { UserRepository } from '../../interfaces/repositories/UserRepository.js';
import type { PasswordHasher } from '../../interfaces/services/PasswordHasher.js';
import type {
  RegisterUserUseCaseError,
  RegisterUserUseCaseInput,
  RegisterUserUseCaseOutput,
} from './registerUser.types.js';

export interface RegisterUserUseCaseDeps {
  readonly userRepository: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly eventPublisher: EventPublisher;
  readonly onPublishFailed?: (
    error: unknown,
    details: { readonly userId: string; readonly correlationId: string },
  ) => void;
}

export class RegisterUserUseCase {
  constructor(private readonly deps: RegisterUserUseCaseDeps) {}

  async execute(
    input: RegisterUserUseCaseInput,
  ): Promise<Result<RegisterUserUseCaseOutput, RegisterUserUseCaseError>> {
    const password = createPassword(input.password);
    if (!password.ok) {
      return err(new ValidationError(password.error.code, password.error.message));
    }

    const user = User.create({
      id: randomUUID(),
      name: input.name,
      email: input.email,
      now: new Date(),
    });
    if (!user.ok) {
      return err(user.error);
    }

    const existing = await this.deps.userRepository.findByEmail(user.value.email);
    if (existing !== null) {
      return err(new ConflictError('EMAIL_TAKEN', 'email is already registered'));
    }

    const passwordHash = await this.deps.passwordHasher.hash(password.value);
    const created = await this.deps.userRepository.create(
      user.value.withPasswordHash(passwordHash),
    );

    await this.publishUserRegistered(input.correlationId, created);

    return ok({
      userId: created.id,
      name: created.name,
      email: created.email,
    });
  }

  private async publishUserRegistered(correlationId: string, user: User): Promise<void> {
    try {
      await this.deps.eventPublisher.publish({
        eventType: 'user.registered',
        correlationId,
        payload: userRegisteredFrom(user),
      });
    } catch (error) {
      this.deps.onPublishFailed?.(error, {
        userId: user.id,
        correlationId,
      });
    }
  }
}
