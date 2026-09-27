import type { Result } from '@zipframes/core';

import type { LoginUseCase } from '../application/useCases/login/LoginUseCase.js';
import type {
  LoginUseCaseError,
  LoginUseCaseInput,
  LoginUseCaseOutput,
} from '../application/useCases/login/login.dto.js';

export interface LoginControllerDeps {
  readonly loginUseCase: LoginUseCase;
}

/**
 * Turns a validated login payload into the use case call.
 * HTTP status, anti-enumeration and problem+json stay in the handler.
 */
export class LoginController {
  constructor(private readonly deps: LoginControllerDeps) {}

  handle(credentials: LoginUseCaseInput): Promise<Result<LoginUseCaseOutput, LoginUseCaseError>> {
    return this.deps.loginUseCase.execute(credentials);
  }
}
