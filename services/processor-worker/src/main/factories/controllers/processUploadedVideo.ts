import { ProcessUploadedVideoController } from '../../../interface-adapters/ProcessUploadedVideoController.js';
import {
  createProcessUploadedVideo,
  type ProcessUploadedVideoExternals,
} from '../use-cases/processUploadedVideo.js';

export const createProcessUploadedVideoController = (
  externals: ProcessUploadedVideoExternals,
): ProcessUploadedVideoController =>
  new ProcessUploadedVideoController(createProcessUploadedVideo(externals));
