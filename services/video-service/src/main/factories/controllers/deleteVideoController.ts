import { DeleteVideoController } from '../../../interface-adapters/DeleteVideoController.js';
import {
  createDeleteVideoUseCase,
  type DeleteVideoExternalDeps,
} from '../use-cases/deleteVideoUseCase.js';
import type { HttpControllerDeps } from './httpControllerDeps.js';

export const createDeleteVideoController = (
  externalDeps: DeleteVideoExternalDeps & HttpControllerDeps,
): DeleteVideoController =>
  new DeleteVideoController(createDeleteVideoUseCase(externalDeps), externalDeps.authenticator);
