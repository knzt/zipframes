import { videoService } from '@zipframes/schemas';

import type { ListUserVideosController } from '../../../interface-adapters/ListUserVideosController.js';
import { BEARER_SECURITY, type HttpRouteDefinition } from '../httpRoute.js';
import { jsonSchemaOf } from '../openapi.js';
import { badRequestResponse, unauthorizedResponse, VIDEO_TAGS } from './common.js';

export const listUserVideosRoute = (controller: ListUserVideosController): HttpRouteDefinition => ({
  method: 'GET',
  path: '/videos',
  openApi: {
    tags: VIDEO_TAGS,
    summary: 'Lista os vídeos do usuário, do mais recente para o mais antigo',
    description:
      'Para a próxima página, envie `before` com o `createdAt` do último item recebido. ' +
      '`status` mostra só os vídeos nesse status (QUEUED, PROCESSING, DONE, FAILED ou EXPIRED).',
    security: BEARER_SECURITY,
    querystring: jsonSchemaOf(videoService.listVideosQuerySchema),
    response: {
      200: jsonSchemaOf(videoService.listVideosResponseSchema),
      400: badRequestResponse,
      401: unauthorizedResponse,
    },
  },
  handle: (request) => controller.handle(request),
});
