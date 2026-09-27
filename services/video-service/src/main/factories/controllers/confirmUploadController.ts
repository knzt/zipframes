import { ConfirmUploadController } from '../../../interface-adapters/ConfirmUploadController.js';
import {
  createConfirmUploadUseCase,
  type ConfirmUploadExternalDeps,
} from '../use-cases/confirmUploadUseCase.js';
import type { HttpControllerDeps } from './httpControllerDeps.js';

export const createConfirmUploadController = (
  externalDeps: ConfirmUploadExternalDeps & HttpControllerDeps,
): ConfirmUploadController =>
  new ConfirmUploadController(createConfirmUploadUseCase(externalDeps), externalDeps.authenticator);
