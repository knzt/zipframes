import { describe, expect, it } from 'vitest';

import { createJwksHandler } from '../../../../../src/infrastructure/http/handlers/jwksHandler.js';

describe('createJwksHandler', () => {
  it('returns the configured keys', async () => {
    const keys = [{ kty: 'RSA', kid: 'k1', alg: 'RS256', use: 'sig', n: 'abc', e: 'AQAB' }];
    const handler = createJwksHandler(keys);

    const response = await handler({ body: undefined, correlationId: 'corr-jwks' });

    expect(response).toEqual({ status: 200, body: { keys } });
  });
});
