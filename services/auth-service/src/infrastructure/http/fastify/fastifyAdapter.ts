import type { FastifyReply, FastifyRequest } from 'fastify';

import type { HttpReply, HttpRequest } from '@zipframes/http';

export const toHttpRequest = (request: FastifyRequest): HttpRequest => {
  const authorization = request.headers.authorization;
  return {
    body: request.body,
    correlationId: request.correlationId,
    ...(typeof authorization === 'string' ? { authorization } : {}),
  };
};

export const sendHttpReply = async (reply: FastifyReply, result: HttpReply): Promise<void> => {
  const outgoing = reply.code(result.status);
  if (result.contentType !== undefined) {
    void outgoing.header('content-type', result.contentType);
  }
  await outgoing.send(result.body);
};
