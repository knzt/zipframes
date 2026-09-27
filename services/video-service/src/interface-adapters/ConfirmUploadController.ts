import type { Authenticator } from '@zipframes/authenticator';
import { defineAuthenticatedHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { videoService } from '@zipframes/schemas';

import type { ConfirmUploadUseCase } from '../application/useCases/confirmUpload/ConfirmUploadUseCase.js';
import type { RoutedHttpRequest } from './RoutedHttpRequest.js';

/** `POST /videos/:videoId/confirm`: queues the uploaded video for processing. */
export class ConfirmUploadController {
  private readonly handler: (request: HttpRequest) => Promise<HttpReply>;

  constructor(
    private readonly confirmUploadUseCase: ConfirmUploadUseCase,
    authenticator: Authenticator,
  ) {
    this.handler = defineAuthenticatedHandler({
      inputSchema: videoService.videoIdParamsSchema,
      outputSchema: videoService.confirmUploadResponseSchema,
      successStatus: 200,
      authenticator,
      handler: ({ videoId }, ctx) =>
        this.confirmUploadUseCase.execute({
          videoId,
          ownerId: ctx.claims.sub,
          correlationId: ctx.correlationId,
        }),
    });
  }

  handle(request: RoutedHttpRequest): Promise<HttpReply> {
    return this.handler({ ...request, body: request.params });
  }
}
