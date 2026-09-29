import type { JWK } from 'jose';

import type { HttpRouteDefinition } from '../httpRoute.js';
import type { DeleteAccountController } from '../../../interface-adapters/DeleteAccountController.js';
import type { LoginController } from '../../../interface-adapters/LoginController.js';
import type { RegisterUserController } from '../../../interface-adapters/RegisterUserController.js';
import { deleteAccountRoute } from './deleteAccount.js';
import { jwksRoute } from './jwks.js';
import { loginRoute } from './login.js';
import { registerUserRoute } from './registerUser.js';

export const identityRoutes = (deps: {
  readonly registerUser: RegisterUserController;
  readonly login: LoginController;
  readonly deleteAccount: DeleteAccountController;
  readonly jwks: readonly JWK[];
}): readonly HttpRouteDefinition[] => [
  registerUserRoute(deps.registerUser),
  loginRoute(deps.login),
  deleteAccountRoute(deps.deleteAccount),
  jwksRoute(deps.jwks),
];
