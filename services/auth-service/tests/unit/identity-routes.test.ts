import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import { createLogger } from '@zipframes/logger';

import { makeLogin } from '../../src/application/useCases/login/login.useCase.js';
import { makeRegisterUser } from '../../src/application/useCases/registerUser/registerUser.useCase.js';
import { registerHealthRoutes } from '../../src/infrastructure/http/routes/health.routes.js';
import { registerIdentityRoutes } from '../../src/infrastructure/http/routes/identity.routes.js';
import { createHttpServer } from '../../src/infrastructure/http/server.js';
import {
  FakeHasher,
  FakeTokenIssuer,
  FixedClock,
  InMemoryUserRepository,
  SequentialIds,
} from '../support/in-memory.js';

const buildApp = async (overrides?: {
  isReady?: () => Promise<{ ready: boolean; reason?: string }>;
  renderMetrics?: () => Promise<string>;
}): Promise<FastifyInstance> => {
  const users = new InMemoryUserRepository();
  const hasher = new FakeHasher();
  const tokens = new FakeTokenIssuer();
  const app = await createHttpServer({ corsOrigin: '*' });

  registerIdentityRoutes(app, {
    registerUser: makeRegisterUser({
      users,
      hasher,
      ids: new SequentialIds(),
      clock: new FixedClock(),
    }),
    login: makeLogin({ users, hasher, tokens }),
    logger: createLogger({ service: 'auth-service', version: 'test', level: 'error' }),
    jwks: [{ kty: 'RSA', kid: 'k1', alg: 'RS256', use: 'sig', n: 'abc', e: 'AQAB' }],
  });
  registerHealthRoutes(app, {
    isReady: overrides?.isReady ?? (async () => ({ ready: true })),
    renderMetrics: overrides?.renderMetrics ?? (async () => 'outbox_exhausted_total 0\n'),
  });

  return app;
};

describe('POST /register', () => {
  it('returns 201 with the shape registerResponseSchema expects', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { name: 'Hellen Santos', email: 'hellen@example.com', password: 'senha1234' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      userId: '0194f3a0-0000-7000-8000-000000000001',
      name: 'Hellen Santos',
      email: 'hellen@example.com',
    });
  });

  it('returns 400 Problem Details for an invalid body', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { name: '', email: 'not-an-email', password: 'x' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({ status: 400 });
  });

  it('returns 409 when the email is already registered', async () => {
    const app = await buildApp();
    const payload = { name: 'Hellen Santos', email: 'hellen@example.com', password: 'senha1234' };

    await app.inject({ method: 'POST', url: '/register', payload });
    const response = await app.inject({ method: 'POST', url: '/register', payload });

    expect(response.statusCode).toBe(409);
  });

  it('mints a correlation id when the header is empty', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      headers: { 'x-correlation-id': '' },
      payload: { name: '', email: 'bad', password: 'x' },
    });

    expect(response.json().correlationId).toEqual(expect.any(String));
    expect(response.json().correlationId).not.toBe('');
  });

  it('echoes the incoming correlation id in the problem response', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      headers: { 'x-correlation-id': 'corr-xyz' },
      payload: { name: '', email: 'bad', password: 'x' },
    });

    expect(response.json()).toMatchObject({ correlationId: 'corr-xyz' });
  });
});

describe('POST /login', () => {
  it('returns 200 with the shape loginResponseSchema expects', async () => {
    const app = await buildApp();
    await app.inject({
      method: 'POST',
      url: '/register',
      payload: { name: 'Hellen Santos', email: 'hellen@example.com', password: 'senha1234' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'hellen@example.com', password: 'senha1234' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
  });

  it('returns 401 for a malformed body, same as wrong credentials', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for wrong credentials', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'nobody@example.com', password: 'senha1234' },
    });

    expect(response.statusCode).toBe(401);
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

describe('register: use case validation beyond what the schema catches', () => {
  it('returns 400 when the password passes the schema but fails the domain policy', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { name: 'Hellen Santos', email: 'hellen@example.com', password: 'abcdefgh' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: 'Invalid request body' });
  });
});
