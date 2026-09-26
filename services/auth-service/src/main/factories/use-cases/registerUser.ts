import {
  RegisterUserUseCase,
  type RegisterUserUseCaseDeps,
} from '../../../application/useCases/registerUser/RegisterUserUseCase.js';

export const createRegisterUser = (deps: RegisterUserUseCaseDeps): RegisterUserUseCase =>
  new RegisterUserUseCase(deps);
