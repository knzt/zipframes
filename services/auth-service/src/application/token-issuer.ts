import type { UserId } from '../domain/user.js';

export interface TokenIssuer {
  /** Signs an access token for the user, returning it and its lifetime. */
  issue: (userId: UserId) => Promise<{ token: string; expiresInSeconds: number }>;
}
