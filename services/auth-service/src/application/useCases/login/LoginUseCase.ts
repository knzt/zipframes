import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';
import { Email } from '@zipframes/value-objects';

import type { UserRepository } from '../../interfaces/repositories/UserRepository.js';
import type { PasswordHasher } from '../../interfaces/services/PasswordHasher.js';
import type { TokenIssuer } from '../../interfaces/services/TokenIssuer.js';
import type { LoginUseCaseError, LoginUseCaseInput, LoginUseCaseOutput } from './login.types.js';

/**
 * The same error for every failure, on purpose: telling "no such email"
 * apart from "wrong password" would let anyone enumerate which addresses
 * are registered.
 */
const invalidCredentials: LoginUseCaseError = {
  code: 'INVALID_CREDENTIALS',
  message: 'invalid email or password',
};

export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly tokenIssuer: TokenIssuer,
  ) {}

  async execute(input: LoginUseCaseInput): Promise<Result<LoginUseCaseOutput, LoginUseCaseError>> {
    const email = Email.create(input.email);
    if (!email.ok) {
      return err(invalidCredentials);
    }

    const user = await this.userRepository.findByEmail(email.value);
    if (user === null) {
      return err(invalidCredentials);
    }

    const matches = await this.passwordHasher.verify(input.password, user.passwordHash);
    if (!matches) {
      return err(invalidCredentials);
    }

    const { token, expiresInSeconds } = await this.tokenIssuer.issue(user.id);

    return ok({
      accessToken: token,
      tokenType: 'Bearer' as const,
      expiresIn: expiresInSeconds,
    });
  }
}
