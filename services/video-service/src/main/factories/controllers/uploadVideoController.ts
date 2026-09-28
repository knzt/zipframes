import { UploadVideoController } from '../../../interface-adapters/UploadVideoController.js';
import {
  createUploadVideoUseCase,
  type UploadVideoExternalDeps,
} from '../use-cases/uploadVideoUseCase.js';
import type { HttpControllerDeps } from './httpControllerDeps.js';

export const createUploadVideoController = (
  externalDeps: UploadVideoExternalDeps & HttpControllerDeps,
): UploadVideoController =>
  new UploadVideoController(createUploadVideoUseCase(externalDeps), externalDeps.authenticator);
