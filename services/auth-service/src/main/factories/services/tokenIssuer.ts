import {
  deriveRsaKeyMaterial,
  type RsaKeyMaterial,
} from '../../../infrastructure/services/crypto/rsaKeys.js';
import { Rs256TokenIssuer } from '../../../infrastructure/services/crypto/rs256TokenIssuer.js';

export const createTokenIssuer = async (options: {
  readonly privateKeyPem: string;
  readonly kid: string;
  readonly issuer: string;
  readonly audience: string;
}): Promise<{ tokenIssuer: Rs256TokenIssuer; keys: RsaKeyMaterial }> => {
  const keys = await deriveRsaKeyMaterial(options.privateKeyPem, options.kid);
  return {
    tokenIssuer: new Rs256TokenIssuer({
      keys,
      issuer: options.issuer,
      audience: options.audience,
    }),
    keys,
  };
};
