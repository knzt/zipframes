import type { DeleteVideoController } from '../../../interface-adapters/DeleteVideoController.js';
import type { GetDownloadUrlController } from '../../../interface-adapters/GetDownloadUrlController.js';
import type { GetVideoController } from '../../../interface-adapters/GetVideoController.js';
import type { ListUserVideosController } from '../../../interface-adapters/ListUserVideosController.js';
import type { UploadVideoController } from '../../../interface-adapters/UploadVideoController.js';
import type { HttpRouteDefinition } from '../httpRoute.js';
import { deleteVideoRoute } from './deleteVideo.js';
import { getDownloadUrlRoute } from './getDownloadUrl.js';
import { getVideoRoute } from './getVideo.js';
import { listUserVideosRoute } from './listUserVideos.js';
import { uploadVideoRoute } from './uploadVideo.js';

export interface VideoControllers {
  readonly uploadVideo: UploadVideoController;
  readonly listUserVideos: ListUserVideosController;
  readonly getVideo: GetVideoController;
  readonly getDownloadUrl: GetDownloadUrlController;
  readonly deleteVideo: DeleteVideoController;
}

export const videoRoutes = (controllers: VideoControllers): readonly HttpRouteDefinition[] => [
  uploadVideoRoute(controllers.uploadVideo),
  listUserVideosRoute(controllers.listUserVideos),
  getVideoRoute(controllers.getVideo),
  getDownloadUrlRoute(controllers.getDownloadUrl),
  deleteVideoRoute(controllers.deleteVideo),
];
