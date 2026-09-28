import type { HttpRequest } from '@zipframes/http';

/**
 * `HttpRequest` plus what the route matched. `@zipframes/http` validates
 * only `body`, so each controller decides which of `params`, `query` or
 * `body` becomes the handler input.
 */
export interface RoutedHttpRequest extends HttpRequest {
  readonly params: Readonly<Record<string, string | undefined>>;
  readonly query: Readonly<Record<string, unknown>>;
}
