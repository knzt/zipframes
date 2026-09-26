import {
  ProcessUploadedVideoUseCase,
  type ProcessUploadedVideoUseCaseDeps,
} from '../../../application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';

export const createProcessUploadedVideo = (
  deps: ProcessUploadedVideoUseCaseDeps,
): ProcessUploadedVideoUseCase => new ProcessUploadedVideoUseCase(deps);
