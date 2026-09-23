import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';

import { createLogger } from '@zipframes/logger';

import { makeLogin } from '../../src/application/use-cases/login.js';
import { makeRegisterUser } from '../../src/application/use-cases/register-user.js';
import { registerIdentityRoutes } from '../../src/infrastructure/http/identity-routes.js';
import { createHttpServer } from '../../src/infrastructure/http/server.js';
import {
  FakeHasher,
  FakeTokenIssuer,
  FixedClock,
  InMemoryUserRepository,
  SequentialIds,
} from '../support/in-memory.js';

const buildApp = (overrides?: {
  isReady?: () => Promise<boolean>;
  renderMetrics?: () => Promise<string>;
}): FastifyInstance => {
  const users = new InMemoryUserRepository();
  const hasher = new FakeHasher();
  const tokens = new FakeTokenIssuer();
  const app = createHttpServer({ corsOrigin: '*' });

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
    isReady: overrides?.isReady ?? (async () => true),
    renderMetrics: overrides?.renderMetrics ?? (async () => 'outbox_exhausted_total 0\n'),
  });

  return app;
};

describe('POST /register', () => {
  it('returns 201 with the shape registerResponseSchema expects', async () => {
    const app = buildApp();

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
    const app = buildApp();

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
    const app = buildApp();
    const payload = { name: 'Hellen Santos', email: 'hellen@example.com', password: 'senha1234' };

    await app.inject({ method: 'POST', url: '/register', payload });
    const response = await app.inject({ method: 'POST', url: '/register', payload });

    expect(response.statusCode).toBe(409);
  });

  it('mints a correlation id when the header is empty', async () => {
    const app = buildApp();

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
    const app = buildApp();

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
    const app = buildApp();
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
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 401 for wrong credentials', async () => {
    const app = buildApp();

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
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      keys: [{ kty: 'RSA', kid: 'k1', alg: 'RS256', use: 'sig', n: 'abc', e: 'AQAB' }],
    });
  });
});

describe('health and metrics', () => {
  it('answers 200 on the liveness probe', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
  });

  it('answers 200 when the process can reach its dependencies', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(200);
  });

  it('answers 503 when a dependency is down', async () => {
    const app = buildApp({ isReady: async () => false });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
  });

  it('answers 503 when the readiness check throws', async () => {
    const app = buildApp({
      isReady: async () => {
        throw new Error('database down');
      },
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
  });

  it('returns the prometheus text from the metrics registry', async () => {
    const app = buildApp();

    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('outbox_exhausted_total');
  });
});

describe('register: use case validation beyond what the schema catches', () => {
  it('returns 400 when the password passes the schema but fails the domain policy', async () => {
    const app = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { name: 'Hellen Santos', email: 'hellen@example.com', password: 'abcdefgh' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ title: 'Invalid request body' });
  });
});
