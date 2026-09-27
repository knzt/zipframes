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
