import { ProcessUploadedVideoController } from '../../../interface-adapters/ProcessUploadedVideoController.js';
import {
  createProcessUploadedVideoUseCase,
  type ProcessUploadedVideoExternalDeps,
} from '../use-cases/processUploadedVideoUseCase.js';

export const createProcessUploadedVideoController = (
  externalDeps: ProcessUploadedVideoExternalDeps,
): ProcessUploadedVideoController =>
  new ProcessUploadedVideoController({
    processUploadedVideoUseCase: createProcessUploadedVideoUseCase(externalDeps),
  });
