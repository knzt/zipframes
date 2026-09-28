import type { Authenticator } from '@zipframes/authenticator';

/** What every HTTP controller needs besides its use case: who is calling. */
export interface HttpControllerDeps {
  readonly authenticator: Authenticator;
}
