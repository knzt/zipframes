import type { Result } from '@zipframes/core';

import type { RegisterUserUseCase } from '../application/useCases/registerUser/RegisterUserUseCase.js';
import type {
  RegisterUserUseCaseError,
  RegisterUserUseCaseOutput,
} from '../application/useCases/registerUser/registerUser.dto.js';

export interface RegisterUserControllerRequest {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface RegisterUserControllerContext {
  readonly correlationId: string;
}

export interface RegisterUserControllerDeps {
  readonly registerUserUseCase: RegisterUserUseCase;
}

/**
 * Turns a validated register payload into the use case call.
 * HTTP status and problem+json stay in the handler.
 */
export class RegisterUserController {
  constructor(private readonly deps: RegisterUserControllerDeps) {}

  handle(
    registration: RegisterUserControllerRequest,
    ctx: RegisterUserControllerContext,
  ): Promise<Result<RegisterUserUseCaseOutput, RegisterUserUseCaseError>> {
    return this.deps.registerUserUseCase.execute({
      ...registration,
      correlationId: ctx.correlationId,
    });
  }
}
