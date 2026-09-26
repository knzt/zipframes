import type { ProcessUploadedVideoUseCase } from '../../../application/useCases/processUploadedVideo/ProcessUploadedVideoUseCase.js';
import { ProcessUploadedVideoController } from '../../../interface-adapters/ProcessUploadedVideoController.js';

export const createProcessUploadedVideoController = (
  processUploadedVideo: ProcessUploadedVideoUseCase,
): ProcessUploadedVideoController => new ProcessUploadedVideoController(processUploadedVideo);
