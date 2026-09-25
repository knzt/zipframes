export interface RegisterUserCommand {
  readonly name: string;
  readonly email: string;
  readonly password: string;
  readonly correlationId: string;
}

export interface RegisterUserResult {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
}

export interface RegisterUserError {
  readonly code: 'INVALID_INPUT' | 'EMAIL_TAKEN';
  readonly message: string;
}
