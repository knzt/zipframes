import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { registerHealthRoutes } from '../../../../../src/infrastructure/http/routes/health.routes.js';
import { registerIdentityRoutes } from '../../../../../src/infrastructure/http/routes/identity.routes.js';
import type { IdentityController } from '../../../../../src/infrastructure/http/routes/identity.routes.js';
import { createHttpServer } from '../../../../../src/infrastructure/http/server.js';

const buildApp = async (overrides?: {
  registerUser?: IdentityController;
  login?: IdentityController;
  isReady?: () => Promise<{ ready: boolean; reason?: string }>;
  renderMetrics?: () => Promise<string>;
}): Promise<FastifyInstance> => {
  const app = await createHttpServer({ corsOrigin: '*' });

  registerIdentityRoutes(app, {
    registerUser: overrides?.registerUser ?? (async () => ({ status: 201, body: {} })),
    login: overrides?.login ?? (async () => ({ status: 200, body: {} })),
    jwks: [{ kty: 'RSA', kid: 'k1', alg: 'RS256', use: 'sig', n: 'abc', e: 'AQAB' }],
  });
  registerHealthRoutes(app, {
    isReady: overrides?.isReady ?? (async () => ({ ready: true })),
    renderMetrics: overrides?.renderMetrics ?? (async () => 'outbox_exhausted_total 0\n'),
  });

  return app;
};

describe('identity route binding', () => {
  it('forwards the register body and correlation id, then sends the controller result', async () => {
    const registerUser = vi.fn(async () => ({
      status: 201,
      body: { userId: 'user-1', name: 'Ada', email: 'ada@example.com' },
    }));
    const app = await buildApp({ registerUser });

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      headers: { 'x-correlation-id': 'corr-xyz' },
      payload: { name: 'Ada', email: 'ada@example.com', password: 'senha1234' },
    });

    expect(registerUser).toHaveBeenCalledWith({
      body: { name: 'Ada', email: 'ada@example.com', password: 'senha1234' },
      correlationId: 'corr-xyz',
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      userId: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
    });
    await app.close();
  });

  it('sets the problem content type when the controller returns one', async () => {
    const registerUser = vi.fn(async () => ({
      status: 409,
      contentType: 'application/problem+json',
      body: { status: 409, title: 'Email already registered' },
    }));
    const app = await buildApp({ registerUser });

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { name: 'Ada' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ title: 'Email already registered' });
    await app.close();
  });

  it('mints a correlation id when the header is empty', async () => {
    const registerUser = vi.fn(async (request: { body: unknown; correlationId: string }) => {
      expect(request.correlationId).toEqual(expect.any(String));
      expect(request.correlationId).not.toBe('');
      return { status: 400, body: { status: 400 } };
    });
    const app = await buildApp({ registerUser });

    await app.inject({
      method: 'POST',
      url: '/register',
      headers: { 'x-correlation-id': '' },
      payload: {},
    });

    expect(registerUser).toHaveBeenCalledOnce();
    await app.close();
  });

  it('forwards the login body and sends the controller result', async () => {
    const login = vi.fn(async () => ({
      status: 200,
      body: { accessToken: 'token', tokenType: 'Bearer', expiresIn: 900 },
    }));
    const app = await buildApp({ login });

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      headers: { 'x-correlation-id': 'corr-login' },
      payload: { email: 'ada@example.com', password: 'senha1234' },
    });

    expect(login).toHaveBeenCalledWith({
      body: { email: 'ada@example.com', password: 'senha1234' },
      correlationId: 'corr-login',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    await app.close();
  });
});

describe('GET /.well-known/jwks.json', () => {
  it('returns the configured keys in the shape jwksResponseSchema expects', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      keys: [{ kty: 'RSA', kid: 'k1', alg: 'RS256', use: 'sig', n: 'abc', e: 'AQAB' }],
    });
  });
});

describe('health and metrics', () => {
  it('answers 200 on the liveness probe', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('answers 200 when the process can reach its dependencies', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ready' });
  });

  it('answers 503 when a dependency is down', async () => {
    const app = await buildApp({
      isReady: async () => ({ ready: false, reason: 'amqp disconnected' }),
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', reason: 'amqp disconnected' });
  });

  it('answers 503 when the readiness check throws', async () => {
    const app = await buildApp({
      isReady: async () => {
        throw new Error('database down');
      },
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', reason: 'database down' });
  });

  it('answers 503 with unknown when a dependency is down and gives no reason', async () => {
    const app = await buildApp({
      isReady: async () => ({ ready: false }),
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', reason: 'unknown' });
  });

  it('answers 503 with unknown when the readiness check throws a non-error', async () => {
    const app = await buildApp({
      isReady: async () => {
        // Exercises the branch where the failure is not an Error.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'offline';
      },
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', reason: 'unknown' });
  });

  it('returns the prometheus text from the metrics registry', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('outbox_exhausted_total');
  });
});

describe('OpenAPI', () => {
  it('serves a document generated from the route schemas', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(200);
    const document: { openapi: string; paths: Record<string, unknown> } = response.json();
    expect(document.openapi).toMatch(/^3\./);
    expect(document.paths['/health/live']).toBeDefined();
    expect(document.paths['/health/ready']).toBeDefined();
    expect(document.paths['/metrics']).toBeDefined();
    expect(document.paths['/.well-known/jwks.json']).toBeDefined();

    const register = document.paths['/register'] as {
      post: {
        requestBody: {
          content: {
            'application/json': {
              schema: {
                properties: {
                  email: { format?: string };
                  password: { minLength?: number };
                };
              };
            };
          };
        };
      };
    };
    const bodySchema = register.post.requestBody.content['application/json'].schema;
    expect(bodySchema.properties.email.format).toBe('email');
    expect(bodySchema.properties.password.minLength).toBe(8);
  });

  it('serves the Swagger UI', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/docs' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('keeps text unquoted and json-encodes objects', async () => {
    const app = await buildApp();
    app.get(
      '/serialized',
      {
        schema: { response: { 200: { type: 'string' } } },
      },
      async (_request, reply) => {
        expect(reply.serialize('plain-text')).toBe('plain-text');
        expect(reply.serialize({ ok: true })).toBe('{"ok":true}');
        return 'plain-text';
      },
    );

    const response = await app.inject({ method: 'GET', url: '/serialized' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('plain-text');
  });
});
