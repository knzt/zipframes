import type { Authenticator } from '@zipframes/authenticator';
import { map } from '@zipframes/core';
import { defineAuthenticatedHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { videoService } from '@zipframes/schemas';

import type { GetVideoUseCase } from '../application/useCases/getVideo/GetVideoUseCase.js';
import type { RoutedHttpRequest } from './RoutedHttpRequest.js';
import { toVideoListItem } from './videoPresenter.js';

/** `GET /videos/:videoId`: status of one of the caller's videos. */
export class GetVideoController {
  private readonly handler: (request: HttpRequest) => Promise<HttpReply>;

  constructor(
    private readonly getVideoUseCase: GetVideoUseCase,
    authenticator: Authenticator,
  ) {
    this.handler = defineAuthenticatedHandler({
      inputSchema: videoService.videoIdParamsSchema,
      outputSchema: videoService.getVideoResponseSchema,
      successStatus: 200,
      authenticator,
      handler: async ({ videoId }, ctx) =>
        map(
          await this.getVideoUseCase.execute({ videoId, ownerId: ctx.claims.sub }),
          toVideoListItem,
        ),
    });
  }

  handle(request: RoutedHttpRequest): Promise<HttpReply> {
    return this.handler({ ...request, body: request.params });
  }
}
