import type { Authenticator } from '@zipframes/authenticator';
import { defineAuthenticatedHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { videoService } from '@zipframes/schemas';
import { z } from 'zod';

import type { DeleteVideoUseCase } from '../application/useCases/deleteVideo/DeleteVideoUseCase.js';
import type { RoutedHttpRequest } from './RoutedHttpRequest.js';

/** `DELETE /videos/:videoId`: removes the files and keeps the minimal history. */
export class DeleteVideoController {
  private readonly handler: (request: HttpRequest) => Promise<HttpReply>;

  constructor(
    private readonly deleteVideoUseCase: DeleteVideoUseCase,
    authenticator: Authenticator,
  ) {
    this.handler = defineAuthenticatedHandler({
      inputSchema: videoService.videoIdParamsSchema,
      // 204: nothing to send back.
      outputSchema: z.undefined(),
      successStatus: 204,
      authenticator,
      handler: ({ videoId }, ctx) =>
        this.deleteVideoUseCase.execute({ videoId, ownerId: ctx.claims.sub }),
    });
  }

  handle(request: RoutedHttpRequest): Promise<HttpReply> {
    return this.handler({ ...request, body: request.params });
  }
}
