import { exportJWK, importPKCS8 } from 'jose';
import type { JWK, KeyLike } from 'jose';

export interface RsaKeyMaterial {
  readonly kid: string;
  readonly privateKey: KeyLike;
  /** The public half only: safe to publish at /.well-known/jwks.json. */
  readonly publicJwk: JWK;
}

/**
 * Derives the signing key and its public JWK from a PEM-encoded PKCS8
 * private key.
 *
 * An RSA private key's JSON Web Key form already contains the public
 * modulus and exponent (`n`, `e`) alongside the private components (`d`,
 * `p`, `q`, `dp`, `dq`, `qi`). Stripping the private ones is enough to get
 * the public key — there is no separate public key file to manage.
 */
export const deriveRsaKeyMaterial = async (
  privateKeyPem: string,
  kid: string,
): Promise<RsaKeyMaterial> => {
  const privateKey = await importPKCS8(privateKeyPem, 'RS256');
  const {
    d: _d,
    p: _p,
    q: _q,
    dp: _dp,
    dq: _dq,
    qi: _qi,
    ...publicJwk
  } = await exportJWK(privateKey);

  return {
    kid,
    privateKey,
    publicJwk: { ...publicJwk, kid, alg: 'RS256', use: 'sig' },
  };
};
