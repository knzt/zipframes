export interface DeleteAccountUseCaseInput {
  readonly userId: string;
  readonly correlationId: string;
}

export type DeleteAccountUseCaseOutput = undefined;

/**
 * Deleting is idempotent from the caller's side: whether or not the row was
 * still there, the account ends up gone. There is no failure to report.
 */
export type DeleteAccountUseCaseError = never;
