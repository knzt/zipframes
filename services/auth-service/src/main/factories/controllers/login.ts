import { LoginController } from '../../../interface-adapters/LoginController.js';
import { createLogin, type LoginExternals } from '../use-cases/login.js';

export const createLoginController = (externals: LoginExternals): LoginController =>
  new LoginController(createLogin(externals));
