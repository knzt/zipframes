import type { FastifySchema, HTTPMethods } from 'fastify';

import type { HttpReply, HttpRequest } from '@zipframes/http';

export interface HttpRouteDefinition {
  readonly method: HTTPMethods;
  readonly path: string;
  readonly openApi: FastifySchema;
  readonly handle: (request: HttpRequest) => Promise<HttpReply>;
}
