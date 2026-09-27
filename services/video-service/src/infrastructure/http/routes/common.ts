import { videoService } from '@zipframes/schemas';

import { jsonSchemaOf } from '../openapi.js';
import { problemDetailsSchema } from '../problemDetails.schema.js';

/** OpenAPI fragments every video route repeats. */
export const VIDEO_TAGS = ['Vídeos'];
export const videoIdParams = jsonSchemaOf(videoService.videoIdParamsSchema);
export const unauthorizedResponse = problemDetailsSchema('Token ausente, inválido ou expirado');
export const notFoundResponse = problemDetailsSchema('Vídeo inexistente ou de outro usuário');
export const badRequestResponse = problemDetailsSchema('Dados inválidos');
