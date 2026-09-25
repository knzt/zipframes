import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';
import { Email } from '@zipframes/value-objects';

import type { UserRepository } from '../../interfaces/repositories/user.repository.js';
import type { PasswordHasher } from '../../interfaces/services/passwordHasher.service.js';
import type { TokenIssuer } from '../../interfaces/services/tokenIssuer.service.js';
import type { LoginCommand, LoginError, LoginResult } from './login.types.js';

/**
 * The same error for every failure, on purpose: telling "no such email"
 * apart from "wrong password" would let anyone enumerate which addresses
 * are registered.
 */
const invalidCredentials: LoginError = {
  code: 'INVALID_CREDENTIALS',
  message: 'invalid email or password',
};

export class LoginUseCase {
  constructor(
    private readonly deps: {
      readonly users: UserRepository;
      readonly hasher: PasswordHasher;
      readonly tokens: TokenIssuer;
    },
  ) {}

  async execute(command: LoginCommand): Promise<Result<LoginResult, LoginError>> {
    const email = Email.create(command.email);
    if (!email.ok) {
      return err(invalidCredentials);
    }

    const user = await this.deps.users.findByEmail(email.value);
    if (user === null) {
      return err(invalidCredentials);
    }

    const matches = await this.deps.hasher.verify(command.password, user.passwordHash);
    if (!matches) {
      return err(invalidCredentials);
    }

    const { token, expiresInSeconds } = await this.deps.tokens.issue(user.id);

    return ok({
      accessToken: token,
      tokenType: 'Bearer' as const,
      expiresIn: expiresInSeconds,
    });
  }
}
