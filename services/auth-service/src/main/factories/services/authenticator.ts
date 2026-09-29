import { createAuthenticatorFromKey, type Authenticator } from '@zipframes/authenticator';
import { createLocalJWKSet } from 'jose';
import type { JWK } from 'jose';

/**
 * Verifies the tokens this same process issues. Unlike the other services,
 * auth-service already holds its own public key in memory, so it checks
 * tokens against it directly instead of fetching its own JWKS over HTTP
 * (which would also need a port this process may not know yet, with
 * `PORT=0`).
 */
export const createSelfAuthenticator = (
  publicJwk: JWK,
  issuer: string,
  audience: string,
): Authenticator =>
  createAuthenticatorFromKey(createLocalJWKSet({ keys: [publicJwk] }), { issuer, audience });
