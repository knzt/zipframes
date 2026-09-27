import { ListUserVideosController } from '../../../interface-adapters/ListUserVideosController.js';
import {
  createListUserVideosUseCase,
  type ListUserVideosExternalDeps,
} from '../use-cases/listUserVideosUseCase.js';
import type { HttpControllerDeps } from './httpControllerDeps.js';

export const createListUserVideosController = (
  externalDeps: ListUserVideosExternalDeps & HttpControllerDeps,
): ListUserVideosController =>
  new ListUserVideosController(
    createListUserVideosUseCase(externalDeps),
    externalDeps.authenticator,
  );
