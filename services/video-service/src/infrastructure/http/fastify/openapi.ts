import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';

export interface OpenApiOptions {
  readonly title: string;
  readonly version: string;
  readonly description: string;
}

/**
 * Registers generated OpenAPI. Route schemas are documentation: controllers
 * keep their own validation, because authentication must answer 401 before
 * any input is looked at.
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
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Token de acesso emitido por POST /login no auth-service.',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });
};
