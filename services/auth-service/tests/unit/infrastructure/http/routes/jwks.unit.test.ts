import { describe, expect, it } from 'vitest';

import { jwksRoute } from '../../../../../src/infrastructure/http/routes/jwks.js';

describe('jwksRoute', () => {
  it('returns the configured keys', async () => {
    const keys = [{ kty: 'RSA', kid: 'k1', alg: 'RS256', use: 'sig', n: 'abc', e: 'AQAB' }];
    const route = jwksRoute(keys);

    const response = await route.handle({ body: undefined, correlationId: 'corr-jwks' });

    expect(route.method).toBe('GET');
    expect(route.path).toBe('/.well-known/jwks.json');
    expect(response).toEqual({ status: 200, body: { keys } });
  });
});
