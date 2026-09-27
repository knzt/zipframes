// TODO: switch to @zipframes/core's problemDetailsSchema (published in
// zipframes/zipframes-packages#47) once it lands as a stable, non-prerelease
// version. Consuming the PR's snapshot here today would bump this service's
// own @zipframes/core to a version @zipframes/http@0.2.0 does not accept
// (it still depends on ^0.4.0), leaving two separate BaseError class
// instances loaded at once — isBaseError() inside @zipframes/http would then
// fail instanceof checks against errors thrown by this service's own code,
// turning every classified error (401, 409, 503…) into a bare 500. Kept
// local until core's stable release (and, if needed, a matching @zipframes/http
// bump) resolve to a single shared instance.
export const problemDetailsJsonSchema = {
  type: 'object',
  required: ['type', 'title', 'status'],
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    correlationId: { type: 'string' },
  },
};

export const problemDetailsSchema = (description: string): Record<string, unknown> => ({
  description,
  content: {
    'application/problem+json': {
      schema: problemDetailsJsonSchema,
    },
  },
});
