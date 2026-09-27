import type { ConfirmUploadController } from '../../../interface-adapters/ConfirmUploadController.js';
import type { DeleteVideoController } from '../../../interface-adapters/DeleteVideoController.js';
import type { GetDownloadUrlController } from '../../../interface-adapters/GetDownloadUrlController.js';
import type { GetVideoController } from '../../../interface-adapters/GetVideoController.js';
import type { ListUserVideosController } from '../../../interface-adapters/ListUserVideosController.js';
import type { RequestUploadController } from '../../../interface-adapters/RequestUploadController.js';
import type { HttpRouteDefinition } from '../httpRoute.js';
import { confirmUploadRoute } from './confirmUpload.js';
import { deleteVideoRoute } from './deleteVideo.js';
import { getDownloadUrlRoute } from './getDownloadUrl.js';
import { getVideoRoute } from './getVideo.js';
import { listUserVideosRoute } from './listUserVideos.js';
import { requestUploadRoute } from './requestUpload.js';

export interface VideoControllers {
  readonly requestUpload: RequestUploadController;
  readonly confirmUpload: ConfirmUploadController;
  readonly listUserVideos: ListUserVideosController;
  readonly getVideo: GetVideoController;
  readonly getDownloadUrl: GetDownloadUrlController;
  readonly deleteVideo: DeleteVideoController;
}

export const videoRoutes = (controllers: VideoControllers): readonly HttpRouteDefinition[] => [
  requestUploadRoute(controllers.requestUpload),
  confirmUploadRoute(controllers.confirmUpload),
  listUserVideosRoute(controllers.listUserVideos),
  getVideoRoute(controllers.getVideo),
  getDownloadUrlRoute(controllers.getDownloadUrl),
  deleteVideoRoute(controllers.deleteVideo),
];
