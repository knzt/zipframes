import { RequestUploadController } from '../../../interface-adapters/RequestUploadController.js';
import {
  createRequestUploadUseCase,
  type RequestUploadExternalDeps,
} from '../use-cases/requestUploadUseCase.js';
import type { HttpControllerDeps } from './httpControllerDeps.js';

export const createRequestUploadController = (
  externalDeps: RequestUploadExternalDeps & HttpControllerDeps,
): RequestUploadController =>
  new RequestUploadController(createRequestUploadUseCase(externalDeps), externalDeps.authenticator);
