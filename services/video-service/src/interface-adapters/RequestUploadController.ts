import type { Authenticator } from '@zipframes/authenticator';
import { defineAuthenticatedHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { videoService } from '@zipframes/schemas';

import type { RequestUploadUseCase } from '../application/useCases/requestUpload/RequestUploadUseCase.js';
import type { RoutedHttpRequest } from './RoutedHttpRequest.js';

/** `POST /videos`: validates what the owner declared and returns the upload URL. */
export class RequestUploadController {
  private readonly handler: (request: HttpRequest) => Promise<HttpReply>;

  constructor(
    private readonly requestUploadUseCase: RequestUploadUseCase,
    authenticator: Authenticator,
  ) {
    this.handler = defineAuthenticatedHandler({
      inputSchema: videoService.requestUploadRequestSchema,
      outputSchema: videoService.requestUploadResponseSchema,
      successStatus: 201,
      authenticator,
      handler: (upload, ctx) =>
        this.requestUploadUseCase.execute({ ...upload, ownerId: ctx.claims.sub }),
    });
  }

  handle(request: RoutedHttpRequest): Promise<HttpReply> {
    return this.handler(request);
  }
}
