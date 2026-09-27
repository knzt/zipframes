import type { JWK } from 'jose';

import { authService } from '@zipframes/schemas';

import { jsonSchemaOf } from '../../infrastructure/http/openapi.js';
import type { HttpRouteDefinition } from '../../infrastructure/http/httpRoute.js';

export const jwksHandler = (jwks: readonly JWK[]): HttpRouteDefinition => {
  const body = authService.jwksResponseSchema.parse({ keys: jwks });
  return {
    method: 'GET',
    path: '/.well-known/jwks.json',
    openApi: {
      tags: ['Identidade'],
      summary: 'Chaves públicas para validar tokens',
      response: {
        200: jsonSchemaOf(authService.jwksResponseSchema),
      },
    },
    handle: () => Promise.resolve({ status: 200, body }),
  };
};
