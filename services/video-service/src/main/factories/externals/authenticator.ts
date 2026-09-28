import { createAuthenticator, type Authenticator } from '@zipframes/authenticator';

export interface AuthenticatorConfig {
  readonly jwksUrl: string;
  readonly issuer: string;
  readonly audience: string;
}

const JWKS_TIMEOUT_MS = 5_000;

/** Verifies tokens against the auth-service JWKS, fetched on first use and cached. */
export const createJwtAuthenticator = (config: AuthenticatorConfig): Authenticator =>
  createAuthenticator({
    jwks: { url: config.jwksUrl, timeoutDurationMs: JWKS_TIMEOUT_MS },
    issuer: config.issuer,
    audience: config.audience,
  });
