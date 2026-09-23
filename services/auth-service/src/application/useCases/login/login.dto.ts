import type { UserRepository } from '../../ports/repositories/user.repository.js';
import type { PasswordHasher } from '../../ports/services/passwordHasher.service.js';
import type { TokenIssuer } from '../../ports/services/tokenIssuer.service.js';

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
