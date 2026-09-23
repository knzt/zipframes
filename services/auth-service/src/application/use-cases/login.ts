import { err, ok } from '@zipframes/core';
import type { Result } from '@zipframes/core';
import { Email } from '@zipframes/value-objects';

import type { PasswordHasher } from '../../domain/password-hasher.js';
import type { UserRepository } from '../../domain/user-repository.js';
import type { TokenIssuer } from '../token-issuer.js';

export interface LoginCommand {
  readonly email: string;
  readonly password: string;
}

export interface LoginResult {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
}

export interface LoginError {
  readonly code: 'INVALID_CREDENTIALS';
  readonly message: string;
}

export interface LoginDependencies {
  readonly users: UserRepository;
  readonly hasher: PasswordHasher;
  readonly tokens: TokenIssuer;
}

/**
 * The same error for every failure, on purpose: telling "no such email"
 * apart from "wrong password" would let anyone enumerate which addresses
 * are registered.
 */
const invalidCredentials: LoginError = {
  code: 'INVALID_CREDENTIALS',
  message: 'invalid email or password',
};

export const makeLogin =
  (deps: LoginDependencies) =>
  async (command: LoginCommand): Promise<Result<LoginResult, LoginError>> => {
    const email = Email.create(command.email);
    if (!email.ok) {
      return err(invalidCredentials);
    }

    const user = await deps.users.findByEmail(email.value);
    // A missing user still pays for a comparison. Returning before verify
    // would make "no such email" faster than "wrong password".
    const matches = await deps.hasher.verify(command.password, user?.passwordHash ?? null);
    if (user === null || !matches) {
      return err(invalidCredentials);
    }

    const { token, expiresInSeconds } = await deps.tokens.issue(user.id);

    return ok({
      accessToken: token,
      tokenType: 'Bearer' as const,
      expiresIn: expiresInSeconds,
    });
  };
