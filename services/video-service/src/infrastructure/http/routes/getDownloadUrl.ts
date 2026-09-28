import { videoService } from '@zipframes/schemas';

import type { GetDownloadUrlController } from '../../../interface-adapters/GetDownloadUrlController.js';
import { BEARER_SECURITY, type HttpRouteDefinition } from '../httpRoute.js';
import { jsonSchemaOf } from '../openapi.js';
import { problemDetailsSchema } from '../problemDetails.schema.js';
import { notFoundResponse, unauthorizedResponse, VIDEO_TAGS, videoIdParams } from './common.js';

export const getDownloadUrlRoute = (controller: GetDownloadUrlController): HttpRouteDefinition => ({
  method: 'GET',
  path: '/videos/:videoId/download',
  openApi: {
    tags: VIDEO_TAGS,
    summary: 'URL pré-assinada do pacote de frames',
    security: BEARER_SECURITY,
    params: videoIdParams,
    response: {
      200: jsonSchemaOf(videoService.downloadResponseSchema),
      401: unauthorizedResponse,
      404: notFoundResponse,
      409: problemDetailsSchema('O pacote ainda não está pronto'),
      410: problemDetailsSchema('O pacote expirou ou foi excluído; envie o vídeo de novo'),
    },
  },
  handle: (request) => controller.handle(request),
});
