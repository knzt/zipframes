import type { HttpReply } from '@zipframes/http';

import type { RoutedHttpRequest } from '../../interface-adapters/RoutedHttpRequest.js';

export type HttpMethod = 'DELETE' | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT' | 'OPTIONS';

export interface HttpRouteDefinition {
  readonly method: HttpMethod;
  /** Fastify path syntax, e.g. `/videos/:videoId`. */
  readonly path: string;
  readonly openApi: Record<string, unknown>;
  /** The body is one uploaded file (multipart/form-data), handed over as a stream. */
  readonly multipart?: boolean;
  readonly handle: (request: RoutedHttpRequest) => Promise<HttpReply>;
}

/** Every business route here needs a bearer token. */
export const BEARER_SECURITY = [{ bearerAuth: [] }];
