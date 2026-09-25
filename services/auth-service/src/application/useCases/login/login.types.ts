export interface LoginUseCaseInput {
  readonly email: string;
  readonly password: string;
}

export interface LoginUseCaseOutput {
  readonly accessToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
}

export interface LoginUseCaseError {
  readonly code: 'INVALID_CREDENTIALS';
  readonly message: string;
}
