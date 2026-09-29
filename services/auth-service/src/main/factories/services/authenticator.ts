import { createAuthenticatorFromKey, type Authenticator } from '@zipframes/authenticator';
import { createLocalJWKSet } from 'jose';
import type { JWK } from 'jose';

/** Exactly the type `createAuthenticatorFromKey` expects, whichever `jose` declared it. */
type GetKey = Parameters<typeof createAuthenticatorFromKey>[0];

/**
 * Verifies the tokens this same process issues. Unlike the other services,
 * auth-service already holds its own public key in memory, so it checks
 * tokens against it directly instead of fetching its own JWKS over HTTP
 * (which would also need a port this process may not know yet, with
 * `PORT=0`).
 *
 * `@zipframes/authenticator` pins its own `jose`, one major ahead of the
 * one auth-service uses for signing; TypeScript sees two unrelated
 * `JWTVerifyGetKey` types where there is really one JOSE contract both
 * satisfy. The cast is the only effect of that duplicate install.
 */
export const createSelfAuthenticator = (
  publicJwk: JWK,
  issuer: string,
  audience: string,
): Authenticator =>
  createAuthenticatorFromKey(createLocalJWKSet({ keys: [publicJwk] }) as unknown as GetKey, {
    issuer,
    audience,
  });
