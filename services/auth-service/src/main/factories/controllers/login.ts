import type { LoginUseCase } from '../../../application/useCases/login/LoginUseCase.js';
import { LoginController } from '../../../interface-adapters/LoginController.js';

export const createLoginController = (login: LoginUseCase): LoginController =>
  new LoginController(login);
