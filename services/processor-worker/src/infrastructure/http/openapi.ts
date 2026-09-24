import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export interface OpenApiOptions {
  readonly title: string;
  readonly version: string;
  readonly description: string;
}

/**
 * Registers generated OpenAPI. The worker has no request bodies to validate;
 * the route schemas describe the health contract.
 */
export const registerOpenApi = async (
  app: FastifyInstance,
  options: OpenApiOptions,
): Promise<void> => {
  app.setValidatorCompiler(() => () => true);
  app.setSerializerCompiler(
    () => (data: unknown) => (typeof data === 'string' ? data : JSON.stringify(data)),
  );

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: options.title,
        version: options.version,
        description: options.description,
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });
};
