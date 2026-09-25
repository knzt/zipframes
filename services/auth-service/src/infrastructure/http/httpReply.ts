/**
 * What the Fastify identity routes send. Application controllers return a
 * narrower shape that matches this structurally; they do not import it.
 */
export interface HttpReply {
  readonly status: number;
  readonly body: unknown;
  readonly contentType?: string;
}
