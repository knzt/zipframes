import type { FastifyInstance } from 'fastify';
import type { JWK } from 'jose';

import type { ReadinessResult } from '@zipframes/core';
import type { Logger } from '@zipframes/logger';

import { LoginController } from '../application/controllers/LoginController.js';
import { RegisterUserController } from '../application/controllers/RegisterUserController.js';
import type { EventPublisher } from '../application/interfaces/gateways/EventPublisher.js';
import type { UserRepository } from '../application/interfaces/repositories/UserRepository.js';
import type { Clock } from '../application/interfaces/services/Clock.js';
import type { IdGenerator } from '../application/interfaces/services/IdGenerator.js';
import type { PasswordHasher } from '../application/interfaces/services/PasswordHasher.js';
import type { TokenIssuer } from '../application/interfaces/services/TokenIssuer.js';
import { LoginUseCase } from '../application/useCases/login/LoginUseCase.js';
import { RegisterUserUseCase } from '../application/useCases/registerUser/RegisterUserUseCase.js';
import { createJwksHandler } from '../infrastructure/http/handlers/jwksHandler.js';
import { createLoginHandler } from '../infrastructure/http/handlers/loginHandler.js';
import { createRegisterUserHandler } from '../infrastructure/http/handlers/registerUserHandler.js';
import { registerHealthRoutes } from '../infrastructure/http/routes/health.routes.js';
import { registerIdentityRoutes } from '../infrastructure/http/routes/identity.routes.js';
import { createHttpServer } from '../infrastructure/http/server.js';

export interface IdentityAppDeps {
  readonly userRepository: UserRepository;
  readonly passwordHasher: PasswordHasher;
  readonly tokenIssuer: TokenIssuer;
  readonly eventPublisher: EventPublisher;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly jwks: readonly JWK[];
  readonly isReady: () => Promise<ReadinessResult>;
  readonly renderMetrics: () => Promise<string>;
  readonly logger: Logger;
  readonly corsOrigin: string;
  readonly onPublishFailed?: (
    error: unknown,
    details: { readonly userId: string; readonly correlationId: string },
  ) => void;
}

export const buildIdentityApp = async (deps: IdentityAppDeps): Promise<FastifyInstance> => {
  const registerUser = new RegisterUserUseCase({
    userRepository: deps.userRepository,
    passwordHasher: deps.passwordHasher,
    idGenerator: deps.idGenerator,
    clock: deps.clock,
    eventPublisher: deps.eventPublisher,
    ...(deps.onPublishFailed === undefined ? {} : { onPublishFailed: deps.onPublishFailed }),
  });
  const login = new LoginUseCase({
    userRepository: deps.userRepository,
    passwordHasher: deps.passwordHasher,
    tokenIssuer: deps.tokenIssuer,
  });

  const app = await createHttpServer({ corsOrigin: deps.corsOrigin, logger: deps.logger });
  registerIdentityRoutes(app, {
    registerUserHandler: createRegisterUserHandler(new RegisterUserController(registerUser)),
    loginHandler: createLoginHandler(new LoginController(login)),
    jwksHandler: createJwksHandler(deps.jwks),
  });
  registerHealthRoutes(app, {
    isReady: deps.isReady,
    renderMetrics: deps.renderMetrics,
    logger: deps.logger,
  });
  return app;
};
