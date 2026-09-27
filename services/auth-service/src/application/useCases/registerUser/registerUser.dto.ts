import type { ConflictError, ValidationError } from '@zipframes/core';

export interface RegisterUserUseCaseInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly correlationId: string;
}

export interface RegisterUserUseCaseOutput {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
}

export type RegisterUserUseCaseError = ValidationError | ConflictError;
