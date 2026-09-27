import { videoService } from '@zipframes/schemas';

import type { GetVideoController } from '../../../interface-adapters/GetVideoController.js';
import { BEARER_SECURITY, type HttpRouteDefinition } from '../httpRoute.js';
import { jsonSchemaOf } from '../openapi.js';
import { notFoundResponse, unauthorizedResponse, VIDEO_TAGS, videoIdParams } from './common.js';

export const getVideoRoute = (controller: GetVideoController): HttpRouteDefinition => ({
  method: 'GET',
  path: '/videos/:videoId',
  openApi: {
    tags: VIDEO_TAGS,
    summary: 'Status de um vídeo',
    security: BEARER_SECURITY,
    params: videoIdParams,
    response: {
      200: jsonSchemaOf(videoService.getVideoResponseSchema),
      401: unauthorizedResponse,
      404: notFoundResponse,
    },
  },
  handle: (request) => controller.handle(request),
});
