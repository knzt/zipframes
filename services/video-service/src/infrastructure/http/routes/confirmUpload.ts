import { videoService } from '@zipframes/schemas';

import type { ConfirmUploadController } from '../../../interface-adapters/ConfirmUploadController.js';
import { BEARER_SECURITY, type HttpRouteDefinition } from '../httpRoute.js';
import { jsonSchemaOf } from '../openapi.js';
import { problemDetailsSchema } from '../problemDetails.schema.js';
import { notFoundResponse, unauthorizedResponse, VIDEO_TAGS, videoIdParams } from './common.js';

export const confirmUploadRoute = (controller: ConfirmUploadController): HttpRouteDefinition => ({
  method: 'POST',
  path: '/videos/:videoId/confirm',
  openApi: {
    tags: VIDEO_TAGS,
    summary: 'Confirma o upload e coloca o vídeo na fila de processamento',
    security: BEARER_SECURITY,
    params: videoIdParams,
    response: {
      200: jsonSchemaOf(videoService.confirmUploadResponseSchema),
      400: problemDetailsSchema('Arquivo enviado vazio ou acima do limite'),
      401: unauthorizedResponse,
      404: notFoundResponse,
      409: problemDetailsSchema('Upload já confirmado ou arquivo ainda não enviado'),
      503: problemDetailsSchema('O vídeo não pôde ser enfileirado; tente de novo'),
    },
  },
  handle: (request) => controller.handle(request),
});
