import { InfrastructureError } from '@zipframes/core';

/**
 * Processing pipeline failure. Extends InfrastructureError so `isRetryableError`
 * and the shared error vocabulary apply. Domain name kept for this context.
 *
 * `retryable: false` ≈ permanent (do not retry); `retryable: true` ≈ transient.
 */
export class ProcessingError extends InfrastructureError {
  constructor(retryable: boolean, code: string, message: string, cause?: unknown) {
    super(code, message, { retryable, cause });
    this.name = 'ProcessingError';
  }
}

export const isProcessingError = (error: unknown): error is ProcessingError =>
  error instanceof ProcessingError;
