import type { JWK } from 'jose';

import type { HttpRouteDefinition } from '../../infrastructure/http/httpRoute.js';
import type { LoginController } from '../../interface-adapters/LoginController.js';
import type { RegisterUserController } from '../../interface-adapters/RegisterUserController.js';
import { jwksHandler } from './jwks.js';
import { loginHandler } from './login.js';
import { registerUserHandler } from './registerUser.js';

export const identityRoutes = (deps: {
  readonly registerUser: RegisterUserController;
  readonly login: LoginController;
  readonly jwks: readonly JWK[];
}): readonly HttpRouteDefinition[] => [
  registerUserHandler(deps.registerUser),
  loginHandler(deps.login),
  jwksHandler(deps.jwks),
];
