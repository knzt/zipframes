import { SignJWT } from 'jose';

import type { TokenIssuer } from '../../../application/interfaces/services/TokenIssuer.js';
import type { UserId } from '../../../domain/entities/user.js';
import type { RsaKeyMaterial } from './rsaKeys.js';

const DEFAULT_EXPIRES_IN_SECONDS = 15 * 60;

export class Rs256TokenIssuer implements TokenIssuer {
  private readonly expiresInSeconds: number;

  constructor(
    private readonly keys: RsaKeyMaterial,
    private readonly issuer: string,
    private readonly audience: string,
    expiresInSeconds?: number,
  ) {
    this.expiresInSeconds = expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
  }

  async issue(userId: UserId): Promise<{ token: string; expiresInSeconds: number }> {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: this.keys.kid })
      .setSubject(userId)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(`${String(this.expiresInSeconds)}s`)
      .sign(this.keys.privateKey);

    return { token, expiresInSeconds: this.expiresInSeconds };
  }
}
