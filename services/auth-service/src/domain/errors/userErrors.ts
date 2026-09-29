export interface UserError {
  readonly code: 'INVALID_NAME' | 'INVALID_EMAIL';
  readonly message: string;
}
