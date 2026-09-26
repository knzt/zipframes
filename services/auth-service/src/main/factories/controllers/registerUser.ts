import type { RegisterUserUseCase } from '../../../application/useCases/registerUser/RegisterUserUseCase.js';
import { RegisterUserController } from '../../../interface-adapters/RegisterUserController.js';

export const createRegisterUserController = (
  registerUser: RegisterUserUseCase,
): RegisterUserController => new RegisterUserController(registerUser);
