import type { DeleteVideoController } from '../../../interface-adapters/DeleteVideoController.js';
import { BEARER_SECURITY, type HttpRouteDefinition } from '../httpRoute.js';
import { problemDetailsSchema } from '../problemDetails.schema.js';
import { notFoundResponse, unauthorizedResponse, VIDEO_TAGS, videoIdParams } from './common.js';

export const deleteVideoRoute = (controller: DeleteVideoController): HttpRouteDefinition => ({
  method: 'DELETE',
  path: '/videos/:videoId',
  openApi: {
    tags: VIDEO_TAGS,
    summary: 'Exclui os arquivos do vídeo e mantém só o histórico mínimo',
    security: BEARER_SECURITY,
    params: videoIdParams,
    response: {
      204: { description: 'Vídeo excluído', type: 'null' },
      401: unauthorizedResponse,
      404: notFoundResponse,
      409: problemDetailsSchema('O vídeo está na fila ou em processamento'),
    },
  },
  handle: (request) => controller.handle(request),
});
