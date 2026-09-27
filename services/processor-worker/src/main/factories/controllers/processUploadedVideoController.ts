import type { RetryOptions } from '@zipframes/communication';

import { ProcessUploadedVideoController } from '../../../interface-adapters/ProcessUploadedVideoController.js';
import {
  createProcessUploadedVideoUseCase,
  type ProcessUploadedVideoExternalDeps,
} from '../use-cases/processUploadedVideoUseCase.js';

export interface ProcessUploadedVideoControllerExternalDeps extends ProcessUploadedVideoExternalDeps {
  readonly retry: RetryOptions;
}

export const createProcessUploadedVideoController = (
  externalDeps: ProcessUploadedVideoControllerExternalDeps,
): ProcessUploadedVideoController =>
  new ProcessUploadedVideoController(
    createProcessUploadedVideoUseCase(externalDeps),
    externalDeps.eventPublisher,
    externalDeps.retry,
  );
