import type { Result } from '@zipframes/core';

import type { RegisterUserUseCase } from '../application/useCases/registerUser/RegisterUserUseCase.js';
import type {
  RegisterUserUseCaseError,
  RegisterUserUseCaseOutput,
} from '../application/useCases/registerUser/registerUser.types.js';

export interface RegisterUserControllerRequest {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface RegisterUserControllerContext {
  readonly correlationId: string;
}

/**
 * Turns a validated register payload into the use case call.
 * HTTP status and problem+json stay in the handler.
 */
export class RegisterUserController {
  constructor(private readonly registerUserUseCase: RegisterUserUseCase) {}

  handle(
    input: RegisterUserControllerRequest,
    ctx: RegisterUserControllerContext,
  ): Promise<Result<RegisterUserUseCaseOutput, RegisterUserUseCaseError>> {
    return this.registerUserUseCase.execute({
      ...input,
      correlationId: ctx.correlationId,
    });
  }
}
