import { Readable } from 'node:stream';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { HttpReply } from '@zipframes/http';

import type { UploadedFile } from '../../../interface-adapters/UploadVideoController.js';
import type { RoutedHttpRequest } from '../../../interface-adapters/RoutedHttpRequest.js';

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/** The first file part: its name, MIME type and a stream of its bytes, still unread. */
const readUploadedFile = async (request: FastifyRequest): Promise<UploadedFile | undefined> => {
  if (!request.isMultipart()) {
    return undefined;
  }
  const part = await request.file();
  if (part === undefined) {
    return undefined;
  }
  return { originalFileName: part.filename, contentType: part.mimetype, content: part.file };
};

export const toHttpRequest = async (
  request: FastifyRequest,
  { multipart }: { readonly multipart: boolean },
): Promise<RoutedHttpRequest> => {
  const authorization = request.headers.authorization;
  return {
    body: multipart ? await readUploadedFile(request) : request.body,
    correlationId: request.correlationId,
    params: asRecord(request.params) as Readonly<Record<string, string | undefined>>,
    query: asRecord(request.query),
    ...(typeof authorization === 'string' ? { authorization } : {}),
  };
};

/**
 * A request refused before its file was read (bad token, wrong extension)
 * still has bytes in flight: drain them so the connection is released.
 */
export const discardUnreadUpload = (request: RoutedHttpRequest): void => {
  const content = (request.body as { content?: unknown } | undefined)?.content;
  if (content instanceof Readable && !content.readableEnded) {
    content.resume();
  }
};

export const sendHttpReply = async (reply: FastifyReply, result: HttpReply): Promise<void> => {
  const outgoing = reply.code(result.status);
  if (result.contentType !== undefined) {
    void outgoing.header('content-type', result.contentType);
  }
  await outgoing.send(result.body);
};
