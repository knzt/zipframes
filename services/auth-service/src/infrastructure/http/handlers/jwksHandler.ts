import type { JWK } from 'jose';

import type { HttpReply, HttpRequest } from '@zipframes/http';
import { authService } from '@zipframes/schemas';

export const createJwksHandler = (
  jwks: readonly JWK[],
): ((request: HttpRequest) => Promise<HttpReply>) => {
  const body = authService.jwksResponseSchema.parse({ keys: jwks });
  return () => Promise.resolve({ status: 200, body });
};
