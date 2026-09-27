import {
  deriveRsaKeyMaterial,
  type RsaKeyMaterial,
} from '../../../infrastructure/services/crypto/rsaKeys.js';
import { Rs256TokenIssuer } from '../../../infrastructure/services/crypto/rs256TokenIssuer.js';

export interface TokenIssuerConfig {
  readonly privateKeyPem: string;
  readonly kid: string;
  readonly issuer: string;
  readonly audience: string;
}

export const createTokenIssuer = async (
  tokenIssuerConfig: TokenIssuerConfig,
): Promise<{ tokenIssuer: Rs256TokenIssuer; keys: RsaKeyMaterial }> => {
  const keys = await deriveRsaKeyMaterial(tokenIssuerConfig.privateKeyPem, tokenIssuerConfig.kid);
  return {
    tokenIssuer: new Rs256TokenIssuer(keys, tokenIssuerConfig.issuer, tokenIssuerConfig.audience),
    keys,
  };
};
