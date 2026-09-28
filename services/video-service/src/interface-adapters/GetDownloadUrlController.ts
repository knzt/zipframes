import type { Authenticator } from '@zipframes/authenticator';
import { defineAuthenticatedHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { videoService } from '@zipframes/schemas';

import type { GetDownloadUrlUseCase } from '../application/useCases/getDownloadUrl/GetDownloadUrlUseCase.js';
import type { RoutedHttpRequest } from './RoutedHttpRequest.js';

/** `GET /videos/:videoId/download`: a short-lived URL for the frames package. */
export class GetDownloadUrlController {
  private readonly handler: (request: HttpRequest) => Promise<HttpReply>;

  constructor(
    private readonly getDownloadUrlUseCase: GetDownloadUrlUseCase,
    authenticator: Authenticator,
  ) {
    this.handler = defineAuthenticatedHandler({
      inputSchema: videoService.videoIdParamsSchema,
      outputSchema: videoService.downloadResponseSchema,
      successStatus: 200,
      authenticator,
      handler: ({ videoId }, ctx) =>
        this.getDownloadUrlUseCase.execute({ videoId, ownerId: ctx.claims.sub }),
    });
  }

  handle(request: RoutedHttpRequest): Promise<HttpReply> {
    return this.handler({ ...request, body: request.params });
  }
}
