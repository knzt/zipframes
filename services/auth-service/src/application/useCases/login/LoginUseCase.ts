import { UnauthorizedError, err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';
import { Email } from '@zipframes/value-objects';

import type { UserRepository } from '../../interfaces/repositories/UserRepository.js';
import type { PasswordHasher } from '../../interfaces/services/PasswordHasher.js';
import type { TokenIssuer } from '../../interfaces/services/TokenIssuer.js';
import type { LoginUseCaseError, LoginUseCaseInput, LoginUseCaseOutput } from './login.dto.js';

/**
 * The same error for every failure, on purpose: telling "no such email"
 * apart from "wrong password" would let anyone enumerate which addresses
 * are registered.
 */
export const invalidCredentials = new UnauthorizedError(
  'INVALID_CREDENTIALS',
  'invalid email or password',
);

export interface LoginUseCaseDeps {
  readonly userRepository: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly tokenIssuer: TokenIssuer;
}

export class LoginUseCase {
  constructor(private readonly deps: LoginUseCaseDeps) {}

  async execute(
    credentials: LoginUseCaseInput,
  ): Promise<Result<LoginUseCaseOutput, LoginUseCaseError>> {
    const email = Email.create(credentials.email);
    if (!email.ok) {
      return err(invalidCredentials);
    }

    const user = await this.deps.userRepository.findByEmail(email.value);
    if (user === null) {
      return err(invalidCredentials);
    }

    const matches = await this.deps.passwordHasher.verify(credentials.password, user.passwordHash);
    if (!matches) {
      return err(invalidCredentials);
    }

    const { token, expiresInSeconds } = await this.deps.tokenIssuer.issue(user.id);

    return ok({
      accessToken: token,
      tokenType: 'Bearer' as const,
      expiresIn: expiresInSeconds,
    });
  }
}
