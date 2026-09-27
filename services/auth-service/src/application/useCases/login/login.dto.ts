import type { UnauthorizedError } from '@zipframes/core';

export interface LoginUseCaseInput {
  readonly email: string;
  readonly password: string;
}

export interface LoginUseCaseOutput {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
}

export type LoginUseCaseError = UnauthorizedError;
