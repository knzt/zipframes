import { Readable } from 'node:stream';

import type { Authenticator } from '@zipframes/authenticator';
import { defineAuthenticatedHandler, type HttpReply, type HttpRequest } from '@zipframes/http';
import { videoService } from '@zipframes/schemas';
import { z } from 'zod';

import type { UploadVideoUseCase } from '../application/useCases/uploadVideo/UploadVideoUseCase.js';
import type { RoutedHttpRequest } from './RoutedHttpRequest.js';

/** The file part of the multipart body, as the HTTP driver hands it over. */
const uploadedFileSchema = z.object({
  originalFileName: z.string().min(1),
  contentType: z.string().min(1),
  content: z.instanceof(Readable),
});

export type UploadedFile = z.infer<typeof uploadedFileSchema>;

/** `POST /videos`: receives the file, stores it and queues it for processing. */
export class UploadVideoController {
  private readonly handler: (request: HttpRequest) => Promise<HttpReply>;

  constructor(
    private readonly uploadVideoUseCase: UploadVideoUseCase,
    authenticator: Authenticator,
  ) {
    this.handler = defineAuthenticatedHandler({
      inputSchema: uploadedFileSchema,
      outputSchema: videoService.uploadVideoResponseSchema,
      successStatus: 201,
      authenticator,
      handler: (file, ctx) =>
        this.uploadVideoUseCase.execute({
          ...file,
          ownerId: ctx.claims.sub,
          correlationId: ctx.correlationId,
        }),
    });
  }

  handle(request: RoutedHttpRequest): Promise<HttpReply> {
    return this.handler(request);
  }
}
