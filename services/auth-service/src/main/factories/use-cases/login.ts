import {
  LoginUseCase,
  type LoginUseCaseDeps,
} from '../../../application/useCases/login/LoginUseCase.js';

export const createLogin = (deps: LoginUseCaseDeps): LoginUseCase => new LoginUseCase(deps);
