import { SignJWT } from 'jose';

import type { TokenIssuer } from '../../../application/interfaces/services/TokenIssuer.js';
import type { UserId } from '../../../domain/entities/user.js';
import type { RsaKeyMaterial } from './rsaKeys.js';

export interface Rs256TokenIssuerDeps {
  readonly keys: RsaKeyMaterial;
  readonly issuer: string;
  readonly audience: string;
  readonly expiresInSeconds?: number;
}

const DEFAULT_EXPIRES_IN_SECONDS = 15 * 60;

export class Rs256TokenIssuer implements TokenIssuer {
  private readonly expiresInSeconds: number;

  constructor(private readonly deps: Rs256TokenIssuerDeps) {
    this.expiresInSeconds = deps.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
  }

  async issue(userId: UserId): Promise<{ token: string; expiresInSeconds: number }> {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: this.deps.keys.kid })
      .setSubject(userId)
      .setIssuer(this.deps.issuer)
      .setAudience(this.deps.audience)
      .setIssuedAt()
      .setExpirationTime(`${String(this.expiresInSeconds)}s`)
      .sign(this.deps.keys.privateKey);

    return { token, expiresInSeconds: this.expiresInSeconds };
  }
}
