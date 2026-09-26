import { describe, expect, it } from 'vitest';

import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  sendHttpReply,
  toHttpRequest,
} from '../../../../src/infrastructure/http/fastifyAdapter.js';

describe('toHttpRequest', () => {
  it('copies body, correlation id and authorization when present', () => {
    const request = {
      body: { email: 'ada@example.com' },
      correlationId: 'corr-1',
      headers: { authorization: 'Bearer token' },
    } as unknown as FastifyRequest;

    expect(toHttpRequest(request)).toEqual({
      body: { email: 'ada@example.com' },
      correlationId: 'corr-1',
      authorization: 'Bearer token',
    });
  });

  it('omits authorization when the header is absent', () => {
    const request = {
      body: {},
      correlationId: 'corr-2',
      headers: {},
    } as unknown as FastifyRequest;

    expect(toHttpRequest(request)).toEqual({
      body: {},
      correlationId: 'corr-2',
    });
  });
});

describe('sendHttpReply', () => {
  it('sets the status and body', async () => {
    const sent: unknown[] = [];
    const reply = {
      code: (status: number) => {
        sent.push(status);
        return {
          send: async (body: unknown) => {
            sent.push(body);
          },
        };
      },
    } as unknown as FastifyReply;

    await sendHttpReply(reply, { status: 201, body: { ok: true } });

    expect(sent).toEqual([201, { ok: true }]);
  });

  it('sets the content type when the handler provides one', async () => {
    const headers: string[] = [];
    const reply = {
      code: () => ({
        header: (name: string, value: string) => {
          headers.push(`${name}:${value}`);
        },
        send: async () => undefined,
      }),
    } as unknown as FastifyReply;

    await sendHttpReply(reply, {
      status: 400,
      contentType: 'application/problem+json',
      body: { status: 400 },
    });

    expect(headers).toEqual(['content-type:application/problem+json']);
  });
});
