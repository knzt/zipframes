import { SignJWT } from "jose";

import type { UserId } from "../../domain/user.js";
import type { TokenIssuer } from "../../application/ports/index.js";
import type { RsaKeyMaterial } from "./rsa-keys.js";

export interface Rs256TokenIssuerOptions {
  readonly keys: RsaKeyMaterial;
  readonly issuer: string;
  readonly audience: string;
  readonly expiresInSeconds?: number;
}

const DEFAULT_EXPIRES_IN_SECONDS = 15 * 60;

export class Rs256TokenIssuer implements TokenIssuer {
  private readonly expiresInSeconds: number;

  constructor(private readonly options: Rs256TokenIssuerOptions) {
    this.expiresInSeconds = options.expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS;
  }

  async issue(userId: UserId): Promise<{ token: string; expiresInSeconds: number }> {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: this.options.keys.kid })
      .setSubject(userId)
      .setIssuer(this.options.issuer)
      .setAudience(this.options.audience)
      .setIssuedAt()
      .setExpirationTime(`${String(this.expiresInSeconds)}s`)
      .sign(this.options.keys.privateKey);

    return { token, expiresInSeconds: this.expiresInSeconds };
  }
}
