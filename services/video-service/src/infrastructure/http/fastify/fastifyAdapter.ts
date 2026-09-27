import type { FastifyReply, FastifyRequest } from 'fastify';

import type { HttpReply } from '@zipframes/http';

import type { RoutedHttpRequest } from '../../../interface-adapters/RoutedHttpRequest.js';

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

export const toHttpRequest = (request: FastifyRequest): RoutedHttpRequest => {
  const authorization = request.headers.authorization;
  return {
    body: request.body,
    correlationId: request.correlationId,
    params: asRecord(request.params) as Readonly<Record<string, string | undefined>>,
    query: asRecord(request.query),
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
