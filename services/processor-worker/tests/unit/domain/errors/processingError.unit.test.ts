import { describe, expect, it } from 'vitest';

import { ProcessingError } from '../../../../src/domain/errors/processingError.js';

describe('ProcessingError', () => {
  it('keeps the cause when one is provided', () => {
    const cause = new Error('disk');
    const error = new ProcessingError(true, 'ZIP_WRITE_FAILED', 'failed writing zip', cause);
    expect(error.cause).toBe(cause);
    expect(error.retryable).toBe(true);
  });
});
