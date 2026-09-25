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
