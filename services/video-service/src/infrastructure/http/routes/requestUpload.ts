import { videoService } from '@zipframes/schemas';

import type { RequestUploadController } from '../../../interface-adapters/RequestUploadController.js';
import { BEARER_SECURITY, type HttpRouteDefinition } from '../httpRoute.js';
import { jsonSchemaOf } from '../openapi.js';
import { badRequestResponse, unauthorizedResponse, VIDEO_TAGS } from './common.js';

export const requestUploadRoute = (controller: RequestUploadController): HttpRouteDefinition => ({
  method: 'POST',
  path: '/videos',
  openApi: {
    tags: VIDEO_TAGS,
    summary: 'Solicita o upload de um vídeo e devolve a URL pré-assinada',
    description:
      'O cliente envia o arquivo com PUT na `uploadUrl`, com os mesmos `Content-Type` e ' +
      '`Content-Length` declarados, e depois confirma em `POST /videos/{videoId}/confirm`.',
    security: BEARER_SECURITY,
    body: jsonSchemaOf(videoService.requestUploadRequestSchema),
    response: {
      201: jsonSchemaOf(videoService.requestUploadResponseSchema),
      400: badRequestResponse,
      401: unauthorizedResponse,
    },
  },
  handle: (request) => controller.handle(request),
});
