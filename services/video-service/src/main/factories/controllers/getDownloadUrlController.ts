import { GetDownloadUrlController } from '../../../interface-adapters/GetDownloadUrlController.js';
import {
  createGetDownloadUrlUseCase,
  type GetDownloadUrlExternalDeps,
} from '../use-cases/getDownloadUrlUseCase.js';
import type { HttpControllerDeps } from './httpControllerDeps.js';

export const createGetDownloadUrlController = (
  externalDeps: GetDownloadUrlExternalDeps & HttpControllerDeps,
): GetDownloadUrlController =>
  new GetDownloadUrlController(
    createGetDownloadUrlUseCase(externalDeps),
    externalDeps.authenticator,
  );
