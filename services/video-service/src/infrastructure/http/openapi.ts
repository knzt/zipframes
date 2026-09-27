import { z, type ZodType } from 'zod';

// TODO: switch to @zipframes/schemas's jsonSchemaOf (published in
// zipframes/zipframes-packages#47) once it lands as a stable release. Its
// snapshot pulls in a prerelease of @zipframes/core that @zipframes/http
// and @zipframes/communication (already published, pinned to ^0.4.0) do not
// resolve to, so two BaseError instances end up loaded side by side. Kept
// local until the packages release train settles on one shared instance.
/**
 * JSON Schema for OpenAPI, taken from the Zod schema the handler already uses
 * to validate. `$schema` is dropped so Ajv does not try to resolve a draft URL.
 */
export const jsonSchemaOf = (schema: ZodType): Record<string, unknown> => {
  const generated = z.toJSONSchema(schema) as Record<string, unknown>;
  delete generated.$schema;
  return generated;
};
