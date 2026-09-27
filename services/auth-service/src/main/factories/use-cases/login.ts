import type { TokenIssuer } from '../../../application/interfaces/services/TokenIssuer.js';
import { LoginUseCase } from '../../../application/useCases/login/LoginUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createPasswordHasher } from '../services/passwordHasher.js';

export interface LoginExternals {
  readonly prisma: Prisma;
  readonly tokenIssuer: TokenIssuer;
}

export const createLogin = (externals: LoginExternals): LoginUseCase =>
  new LoginUseCase({
    userRepository: createUserRepository(externals.prisma),
    passwordHasher: createPasswordHasher(),
    tokenIssuer: externals.tokenIssuer,
  });
