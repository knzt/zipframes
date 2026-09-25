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

export interface RegisterUserUseCaseError {
  readonly code: 'INVALID_INPUT' | 'EMAIL_TAKEN';
  readonly message: string;
}
