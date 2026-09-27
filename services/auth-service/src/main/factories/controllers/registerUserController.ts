import { RegisterUserController } from '../../../interface-adapters/RegisterUserController.js';
import {
  createRegisterUserUseCase,
  type RegisterUserExternalDeps,
} from '../use-cases/registerUserUseCase.js';

export const createRegisterUserController = (
  externalDeps: RegisterUserExternalDeps,
): RegisterUserController => new RegisterUserController(createRegisterUserUseCase(externalDeps));
