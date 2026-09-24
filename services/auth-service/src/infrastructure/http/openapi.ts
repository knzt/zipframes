import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { z, type ZodType } from 'zod';

export interface OpenApiOptions {
  readonly title: string;
  readonly version: string;
  readonly description: string;
}

/**
 * JSON Schema for `@fastify/swagger`, taken from the Zod schema the handler
 * already uses to validate. `$schema` is dropped so Ajv does not try to
 * resolve a draft URL.
 */
export const jsonSchemaOf = (schema: ZodType): Record<string, unknown> => {
  const generated = z.toJSONSchema(schema) as Record<string, unknown>;
  delete generated.$schema;
  return generated;
};

/**
 * Registers generated OpenAPI. Route schemas are documentation: handlers keep
 * their own validation, because a schema failure is not always HTTP 400
 * (login answers 401).
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
