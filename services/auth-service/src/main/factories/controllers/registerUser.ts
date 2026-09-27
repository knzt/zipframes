import { RegisterUserController } from '../../../interface-adapters/RegisterUserController.js';
import { createRegisterUser, type RegisterUserExternals } from '../use-cases/registerUser.js';

export const createRegisterUserController = (
  externals: RegisterUserExternals,
): RegisterUserController => new RegisterUserController(createRegisterUser(externals));
