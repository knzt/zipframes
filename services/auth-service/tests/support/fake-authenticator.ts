import type { Authenticator } from '@zipframes/authenticator';
import { UnauthorizedError, err, ok } from '@zipframes/core';

const TOKEN_PREFIX = 'token-for-';

/** `Bearer token-for-<sub>` is accepted as that user; anything else is rejected. */
export const fakeAuthenticator: Authenticator = {
  verify: (token) =>
    Promise.resolve(
      token.startsWith(TOKEN_PREFIX)
        ? ok({ sub: token.slice(TOKEN_PREFIX.length) })
        : err(new UnauthorizedError('AUTH_INVALID_TOKEN', 'invalid token')),
    ),
};

export const bearerFor = (userId: string): string => `Bearer ${TOKEN_PREFIX}${userId}`;
