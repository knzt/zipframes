import type { FastifyInstance } from 'fastify';

import type { HttpRouteDefinition } from '../httpRoute.js';
import { discardUnreadUpload, sendHttpReply, toHttpRequest } from './fastifyAdapter.js';

/** Single Fastify `app.route` for the HTTP catalog assembled in `infrastructure/http/routes`. */
export const bindHttpRoutes = (
  app: FastifyInstance,
  routes: readonly HttpRouteDefinition[],
): void => {
  for (const route of routes) {
    app.route({
      method: route.method,
      url: route.path,
      schema: route.openApi,
      handler: async (fastifyRequest, reply) => {
        const request = await toHttpRequest(fastifyRequest, {
          multipart: route.multipart === true,
        });
        try {
          await sendHttpReply(reply, await route.handle(request));
        } finally {
          discardUnreadUpload(request);
        }
      },
    });
  }
};
