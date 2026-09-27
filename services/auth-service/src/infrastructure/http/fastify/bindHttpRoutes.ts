import type { FastifyInstance } from 'fastify';

import type { HttpRouteDefinition } from '../httpRoute.js';
import { sendHttpReply, toHttpRequest } from './fastifyAdapter.js';

/** Single Fastify `app.route` for the HTTP catalog assembled in `main/handlers`. */
export const bindHttpRoutes = (
  app: FastifyInstance,
  routes: readonly HttpRouteDefinition[],
): void => {
  for (const route of routes) {
    app.route({
      method: route.method,
      url: route.path,
      schema: route.openApi,
      handler: async (request, reply) => {
        await sendHttpReply(reply, await route.handle(toHttpRequest(request)));
      },
    });
  }
};
