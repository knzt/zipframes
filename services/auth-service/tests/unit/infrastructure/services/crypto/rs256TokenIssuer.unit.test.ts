import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { generateKeyPair, exportPKCS8, importJWK, jwtVerify } from 'jose';
import { beforeEach, describe, expect, it } from 'vitest';

import { createAuthenticator } from '@zipframes/authenticator';

import { asUserId } from '../../../../../src/domain/entities/user.js';
import { deriveRsaKeyMaterial } from '../../../../../src/infrastructure/services/crypto/rsaKeys.js';
import type { RsaKeyMaterial } from '../../../../../src/infrastructure/services/crypto/rsaKeys.js';
import { Rs256TokenIssuer } from '../../../../../src/infrastructure/services/crypto/rs256TokenIssuer.js';

const ISSUER = 'https://auth.zipframes.test';
const AUDIENCE = 'zipframes';

const setUpIssuer = async (): Promise<RsaKeyMaterial> => {
  const { privateKey } = await generateKeyPair('RS256');
  const pem = await exportPKCS8(privateKey);
  return deriveRsaKeyMaterial(pem, 'key-1');
};

describe('the token an issuer signs', () => {
  it('carries the user id as the subject, and iss/aud/exp', async () => {
    const keys = await setUpIssuer();
    const issuer = new Rs256TokenIssuer({ keys, issuer: ISSUER, audience: AUDIENCE });

    const { token, expiresInSeconds } = await issuer.issue(asUserId('user-123'));
    expect(expiresInSeconds).toBe(15 * 60);

    const { payload } = await jwtVerify(token, keys.privateKey, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect(payload.sub).toBe('user-123');
    expect(payload.iat).toBeTypeOf('number');
    expect(payload.exp).toBeTypeOf('number');
  });

  it('honours a configured lifetime', async () => {
    const keys = await setUpIssuer();
    const issuer = new Rs256TokenIssuer({
      keys,
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresInSeconds: 60,
    });

    const { expiresInSeconds } = await issuer.issue(asUserId('user-123'));

    expect(expiresInSeconds).toBe(60);
  });
});

describe('cross-package compatibility with @zipframes/authenticator', () => {
  let jwksUrl: string;
  let close: () => Promise<void>;
  let keys: Awaited<ReturnType<typeof setUpIssuer>>;

  beforeEach(async () => {
    keys = await setUpIssuer();

    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [keys.publicJwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    jwksUrl = `http://127.0.0.1:${String(port)}/.well-known/jwks.json`;
    close = () =>
      new Promise((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
  });

  it('is accepted by the real authenticator package, from the derived public JWK alone', async () => {
    const issuer = new Rs256TokenIssuer({ keys, issuer: ISSUER, audience: AUDIENCE });
    const authenticator = createAuthenticator({
      jwks: { url: jwksUrl },
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const { token } = await issuer.issue(asUserId('user-456'));
    const result = await authenticator.verify(token);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sub).toBe('user-456');

    await close();
  });

  it('is rejected once verified with the wrong audience, proving the check is real', async () => {
    const issuer = new Rs256TokenIssuer({ keys, issuer: ISSUER, audience: AUDIENCE });
    const authenticator = createAuthenticator({
      jwks: { url: jwksUrl },
      issuer: ISSUER,
      audience: 'some-other-system',
    });

    const { token } = await issuer.issue(asUserId('user-456'));
    const result = await authenticator.verify(token);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('AUTH_INVALID_TOKEN');

    await close();
  });

  it('can also be verified directly against the derived public JWK, without HTTP', async () => {
    const publicKey = await importJWK(keys.publicJwk, 'RS256');
    const issuer = new Rs256TokenIssuer({ keys, issuer: ISSUER, audience: AUDIENCE });

    const { token } = await issuer.issue(asUserId('user-789'));

    const { payload } = await jwtVerify(token, publicKey, { issuer: ISSUER, audience: AUDIENCE });
    expect(payload.sub).toBe('user-789');
  });
});
