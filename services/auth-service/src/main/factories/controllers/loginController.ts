import { LoginController } from '../../../interface-adapters/LoginController.js';
import { createLoginUseCase, type LoginExternalDeps } from '../use-cases/loginUseCase.js';

export const createLoginController = (externalDeps: LoginExternalDeps): LoginController =>
  new LoginController(createLoginUseCase(externalDeps));
