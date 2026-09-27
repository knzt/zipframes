import type { TokenIssuer } from '../../../application/interfaces/services/TokenIssuer.js';
import { LoginUseCase } from '../../../application/useCases/login/LoginUseCase.js';
import type { Prisma } from '../externals/prisma.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { createPasswordHasher } from '../services/passwordHasher.js';

/** Clients opened once in `start.ts` and reused for this use case. */
export interface LoginExternalDeps {
  readonly prisma: Prisma;
  readonly tokenIssuer: TokenIssuer;
}

export const createLoginUseCase = (externalDeps: LoginExternalDeps): LoginUseCase =>
  new LoginUseCase({
    userRepository: createUserRepository(externalDeps.prisma),
    passwordHasher: createPasswordHasher(),
    tokenIssuer: externalDeps.tokenIssuer,
  });
