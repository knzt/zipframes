import { describe, expect, it } from 'vitest';

import { runWithCorrelationId } from '@zipframes/logger';

import { correlationIdForRegistration } from '../../src/infrastructure/repositories/prisma/registration-correlation.js';

describe('correlationIdForRegistration', () => {
  it('keeps the correlation id of the current request', () => {
    const id = runWithCorrelationId('0194f3a0-0000-7000-8000-000000000099', () =>
      correlationIdForRegistration(),
    );

    expect(id).toBe('0194f3a0-0000-7000-8000-000000000099');
  });

  it('mints a correlation id when the request has none', () => {
    expect(correlationIdForRegistration()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
