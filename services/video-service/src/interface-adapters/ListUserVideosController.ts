import type { Authenticator } from '@zipframes/authenticator';
import { map } from '@zipframes/core';
import { defineAuthenticatedHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { videoService } from '@zipframes/schemas';

import type { ListUserVideosUseCase } from '../application/useCases/listUserVideos/ListUserVideosUseCase.js';
import type { RoutedHttpRequest } from './RoutedHttpRequest.js';
import { toVideoListItem } from './videoPresenter.js';

/**
 * `GET /videos`: the caller's videos, newest first. The next page is asked
 * with `before` set to the `createdAt` of the last item received.
 */
export class ListUserVideosController {
  private readonly handler: (request: HttpRequest) => Promise<HttpReply>;

  constructor(
    private readonly listUserVideosUseCase: ListUserVideosUseCase,
    authenticator: Authenticator,
  ) {
    this.handler = defineAuthenticatedHandler({
      inputSchema: videoService.listVideosQuerySchema,
      outputSchema: videoService.listVideosResponseSchema,
      successStatus: 200,
      authenticator,
      handler: async ({ limit, before }, ctx) =>
        map(
          await this.listUserVideosUseCase.execute({
            ownerId: ctx.claims.sub,
            limit,
            ...(before !== undefined ? { before: new Date(before) } : {}),
          }),
          ({ items }) => ({ items: items.map(toVideoListItem) }),
        ),
    });
  }

  handle(request: RoutedHttpRequest): Promise<HttpReply> {
    return this.handler({ ...request, body: request.query });
  }
}
