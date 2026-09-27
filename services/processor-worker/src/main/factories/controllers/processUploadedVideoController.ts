import {
  ProcessUploadedVideoController,
  type ProcessUploadedVideoHandlerOptions,
} from '../../../interface-adapters/ProcessUploadedVideoController.js';
import {
  createProcessUploadedVideoUseCase,
  type ProcessUploadedVideoExternalDeps,
} from '../use-cases/processUploadedVideoUseCase.js';

export interface ProcessUploadedVideoControllerExternalDeps extends ProcessUploadedVideoExternalDeps {
  readonly handlerOptions: ProcessUploadedVideoHandlerOptions;
}

export const createProcessUploadedVideoController = (
  externalDeps: ProcessUploadedVideoControllerExternalDeps,
): ProcessUploadedVideoController =>
  new ProcessUploadedVideoController(
    createProcessUploadedVideoUseCase(externalDeps),
    externalDeps.eventPublisher,
    externalDeps.handlerOptions,
  );
