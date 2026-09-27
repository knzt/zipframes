import { z, type ZodType } from 'zod';

/**
 * JSON Schema for OpenAPI, taken from the Zod schema the handler already uses
 * to validate. `$schema` is dropped so Ajv does not try to resolve a draft URL.
 */
export const jsonSchemaOf = (schema: ZodType): Record<string, unknown> => {
  const generated = z.toJSONSchema(schema) as Record<string, unknown>;
  delete generated.$schema;
  return generated;
};
