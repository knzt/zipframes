import type { Authenticator } from '@zipframes/authenticator';
import type { JWK } from 'jose';

import { deriveRsaKeyMaterial } from '../../../infrastructure/services/crypto/rsaKeys.js';
import { Rs256TokenIssuer } from '../../../infrastructure/services/crypto/rs256TokenIssuer.js';
import { createSelfAuthenticator } from './authenticator.js';

export interface TokenServicesConfig {
  readonly privateKeyPem: string;
  readonly kid: string;
  readonly issuer: string;
  readonly audience: string;
}

export interface TokenServices {
  readonly tokenIssuer: Rs256TokenIssuer;
  /** Verifies what `tokenIssuer` signs: same key material, same claims. */
  readonly authenticator: Authenticator;
  /** The public half only, as served at /.well-known/jwks.json. */
  readonly publicJwk: JWK;
}

/**
 * Builds both halves of the token contract at once. They are one decision —
 * a key pair plus an issuer and an audience — so the composition root names
 * those values once instead of handing the same pair to two factories.
 */
export const createTokenServices = async (config: TokenServicesConfig): Promise<TokenServices> => {
  const keys = await deriveRsaKeyMaterial(config.privateKeyPem, config.kid);
  return {
    tokenIssuer: new Rs256TokenIssuer(keys, config.issuer, config.audience),
    authenticator: createSelfAuthenticator(keys.publicJwk, config.issuer, config.audience),
    publicJwk: keys.publicJwk,
  };
};
