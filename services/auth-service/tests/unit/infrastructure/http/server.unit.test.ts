import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { Logger } from '@zipframes/logger';

import { createHttpServer } from '../../../../src/infrastructure/http/server.js';

const INTERNAL_MESSAGE = 'database exploded';

const loggerStub = (): Logger => {
  const stub: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => stub),
  };
  return stub;
};

const buildApp = async (
  logger: Logger = loggerStub(),
): Promise<{ app: FastifyInstance; logger: Logger }> => {
  const app = await createHttpServer({ corsOrigin: '*', logger });
  app.get('/boom', async () => {
    throw new Error(INTERNAL_MESSAGE);
  });
  app.post('/echo', async () => ({ ok: true }));
  return { app, logger };
};

describe('unhandled HTTP errors', () => {
  it('answers 500 problem details when a handler throws, without leaking the internal message', async () => {
    const { app, logger } = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/boom',
      headers: { 'x-correlation-id': 'corr-500' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toEqual({
      type: 'about:blank',
      status: 500,
      title: 'Internal server error',
      correlationId: 'corr-500',
    });
    expect(response.body).not.toContain(INTERNAL_MESSAGE);
    expect(logger.error).toHaveBeenCalledWith(
      'unhandled http error',
      expect.objectContaining({
        correlationId: 'corr-500',
        err: expect.anything(),
      }),
    );
    await app.close();
  });

  it('mints a correlation id for an unexpected throw when the header is missing', async () => {
    const { app } = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json().correlationId).toEqual(expect.any(String));
    expect(response.json().correlationId).not.toBe('');
    expect(response.body).not.toContain(INTERNAL_MESSAGE);
    await app.close();
  });
});

describe('Fastify client errors as problem details', () => {
  it('answers 404 problem details for an unknown route', async () => {
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/no-such-route',
      headers: { 'x-correlation-id': 'corr-404' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toEqual({
      type: 'about:blank',
      status: 404,
      title: 'Not found',
      correlationId: 'corr-404',
    });
    expect(response.json()).not.toHaveProperty('message');
    expect(response.json()).not.toHaveProperty('statusCode');
    await app.close();
  });

  it('mints a correlation id for a 404 when the header is empty', async () => {
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'GET',
      url: '/no-such-route',
      headers: { 'x-correlation-id': '' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().correlationId).toEqual(expect.any(String));
    expect(response.json().correlationId).not.toBe('');
    await app.close();
  });

  it('answers 400 problem details for malformed JSON, without the parser message', async () => {
    const { app } = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': 'corr-400',
      },
      payload: '{not-json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toEqual({
      type: 'about:blank',
      status: 400,
      title: 'Invalid request',
      correlationId: 'corr-400',
    });
    expect(response.body).not.toContain('Unexpected');
    expect(response.json()).not.toHaveProperty('message');
    await app.close();
  });
});
