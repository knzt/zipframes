import { videoService } from '@zipframes/schemas';

import type { UploadVideoController } from '../../../interface-adapters/UploadVideoController.js';
import { BEARER_SECURITY, type HttpRouteDefinition } from '../httpRoute.js';
import { jsonSchemaOf } from '../openapi.js';
import { problemDetailsSchema } from '../problemDetails.schema.js';
import { badRequestResponse, unauthorizedResponse, VIDEO_TAGS } from './common.js';

export const uploadVideoRoute = (controller: UploadVideoController): HttpRouteDefinition => ({
  method: 'POST',
  path: '/videos',
  multipart: true,
  openApi: {
    tags: VIDEO_TAGS,
    summary: 'Envia um vídeo e o coloca na fila de processamento',
    description:
      '`multipart/form-data` com um único campo `file`. O arquivo vai direto para o storage ' +
      'e o vídeo já volta `QUEUED`; o andamento aparece em `GET /videos/{videoId}`.',
    security: BEARER_SECURITY,
    consumes: ['multipart/form-data'],
    body: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
    response: {
      201: jsonSchemaOf(videoService.uploadVideoResponseSchema),
      400: badRequestResponse,
      401: unauthorizedResponse,
      413: problemDetailsSchema('Arquivo acima do tamanho máximo'),
      503: problemDetailsSchema('O vídeo não pôde ser enfileirado; envie de novo'),
    },
  },
  handle: (request) => controller.handle(request),
});
