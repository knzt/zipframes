import type { HttpReply, HttpRequest } from '@zipframes/http';

export type HttpMethod = 'DELETE' | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT' | 'OPTIONS';

export interface HttpRouteDefinition {
  readonly method: HttpMethod;
  readonly path: string;
  readonly openApi: Record<string, unknown>;
  readonly handle: (request: HttpRequest) => Promise<HttpReply>;
}

/** Every authenticated route here needs a bearer token. */
export const BEARER_SECURITY = [{ bearerAuth: [] }];
