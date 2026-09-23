export interface UserError {
  readonly code: 'INVALID_NAME' | 'INVALID_EMAIL';
  readonly message: string;
}

export interface PasswordError {
  readonly code: 'TOO_SHORT' | 'TOO_LONG' | 'NO_LETTER' | 'NO_DIGIT';
  readonly message: string;
}
