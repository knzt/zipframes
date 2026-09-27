import { GetVideoController } from '../../../interface-adapters/GetVideoController.js';
import { createGetVideoUseCase, type GetVideoExternalDeps } from '../use-cases/getVideoUseCase.js';
import type { HttpControllerDeps } from './httpControllerDeps.js';

export const createGetVideoController = (
  externalDeps: GetVideoExternalDeps & HttpControllerDeps,
): GetVideoController =>
  new GetVideoController(createGetVideoUseCase(externalDeps), externalDeps.authenticator);
