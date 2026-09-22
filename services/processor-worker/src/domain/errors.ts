export type FailureKind = 'permanent' | 'transient';

export class ProcessingError extends Error {
  readonly kind: FailureKind;
  readonly code: string;

  constructor(kind: FailureKind, code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'ProcessingError';
    this.kind = kind;
    this.code = code;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export const isProcessingError = (error: unknown): error is ProcessingError =>
  error instanceof ProcessingError;
