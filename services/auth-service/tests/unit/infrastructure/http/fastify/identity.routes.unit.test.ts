import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import type { HttpReply, HttpRequest } from '@zipframes/http';
import type { Logger } from '@zipframes/logger';

import { bindHttpRoutes } from '../../../../../src/infrastructure/http/fastify/bindHttpRoutes.js';
import { registerHealthRoutes } from '../../../../../src/infrastructure/http/fastify/health.routes.js';
import { createHttpServer } from '../../../../../src/infrastructure/http/fastify/server.js';
import type { HttpRouteDefinition } from '../../../../../src/infrastructure/http/httpRoute.js';
import type { DeleteAccountController } from '../../../../../src/interface-adapters/DeleteAccountController.js';
import type { LoginController } from '../../../../../src/interface-adapters/LoginController.js';
import type { RegisterUserController } from '../../../../../src/interface-adapters/RegisterUserController.js';
import { identityRoutes } from '../../../../../src/infrastructure/http/routes/identityRoutes.js';
import { silentLogger } from '../../../../support/silent-logger.js';

type IdentityHandler = (request: HttpRequest) => Promise<HttpReply>;

const stubRegisterUser: RegisterUserController = {
  handle: async () => ({
    status: 201,
    body: { userId: 'user-1', name: 'Ada', email: 'ada@example.com' },
  }),
} as unknown as RegisterUserController;

const stubLogin: LoginController = {
  handle: async () => ({
    status: 200,
    body: { accessToken: 'token', tokenType: 'Bearer', expiresIn: 900 },
  }),
} as unknown as LoginController;

const stubDeleteAccount: DeleteAccountController = {
  handle: async () => ({ status: 204, body: undefined }),
} as unknown as DeleteAccountController;

const withHandle = (
  routes: readonly HttpRouteDefinition[],
  path: string,
  handle: IdentityHandler,
): HttpRouteDefinition[] => routes.map((item) => (item.path === path ? { ...item, handle } : item));

const buildApp = async (overrides?: {
  registerUserHandler?: IdentityHandler;
  loginHandler?: IdentityHandler;
  deleteAccountHandler?: IdentityHandler;
  jwksHandler?: IdentityHandler;
  isReady?: () => Promise<{ ready: boolean; reason?: string }>;
  renderMetrics?: () => Promise<string>;
  logger?: Logger;
}): Promise<FastifyInstance> => {
  const app = await createHttpServer({ corsOrigin: '*', logger: silentLogger() });

  let routes = identityRoutes({
    registerUser: stubRegisterUser,
    login: stubLogin,
    deleteAccount: stubDeleteAccount,
    jwks: [{ kty: 'RSA', kid: 'k1', alg: 'RS256', use: 'sig', n: 'abc', e: 'AQAB' }],
  });
  if (overrides?.registerUserHandler !== undefined) {
    routes = withHandle(routes, '/register', overrides.registerUserHandler);
  }
  if (overrides?.loginHandler !== undefined) {
    routes = withHandle(routes, '/login', overrides.loginHandler);
  }
  if (overrides?.deleteAccountHandler !== undefined) {
    routes = withHandle(routes, '/account', overrides.deleteAccountHandler);
  }
  if (overrides?.jwksHandler !== undefined) {
    routes = withHandle(routes, '/.well-known/jwks.json', overrides.jwksHandler);
  }
  bindHttpRoutes(app, routes);
  registerHealthRoutes(app, {
    isReady: overrides?.isReady ?? (async () => ({ ready: true })),
    renderMetrics: overrides?.renderMetrics ?? (async () => 'nodejs_version_info 1\n'),
    ...(overrides?.logger === undefined ? {} : { logger: overrides.logger }),
  });

  return app;
};

describe('identity route binding', () => {
  it('forwards the register body and correlation id, then sends the handler result', async () => {
    const handle = vi.fn(async () => ({
      status: 201,
      body: { userId: 'user-1', name: 'Ada', email: 'ada@example.com' },
    }));
    const app = await buildApp({ registerUserHandler: handle });

    const response = await app.inject({
      method: 'POST',
      url: '/register',
      headers: { 'x-correlation-id': 'corr-xyz' },
      payload: { name: 'Ada', email: 'ada@example.com', password: 'senha1234' },
    });

    expect(handle).toHaveBeenCalledWith({
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

  it('sets the problem content type when the handler returns one', async () => {
    const app = await buildApp({
      registerUserHandler: async () => ({
        status: 409,
        contentType: 'application/problem+json',
        body: { status: 409, title: 'Email already registered' },
      }),
    });

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
    const handle = vi.fn(async (request: { body: unknown; correlationId: string }) => {
      expect(request.correlationId).toEqual(expect.any(String));
      expect(request.correlationId).not.toBe('');
      return { status: 400, body: { status: 400 } };
    });
    const app = await buildApp({ registerUserHandler: handle });

    await app.inject({
      method: 'POST',
      url: '/register',
      headers: { 'x-correlation-id': '' },
      payload: {},
    });

    expect(handle).toHaveBeenCalledOnce();
    await app.close();
  });

  it('forwards the login body and sends the handler result', async () => {
    const handle = vi.fn(async () => ({
      status: 200,
      body: { accessToken: 'token', tokenType: 'Bearer', expiresIn: 900 },
    }));
    const app = await buildApp({ loginHandler: handle });

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      headers: { 'x-correlation-id': 'corr-login' },
      payload: { email: 'ada@example.com', password: 'senha1234' },
    });

    expect(handle).toHaveBeenCalledWith({
      body: { email: 'ada@example.com', password: 'senha1234' },
      correlationId: 'corr-login',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
    await app.close();
  });

  it('forwards the delete-account request with no body', async () => {
    const handle = vi.fn(async () => ({ status: 204, body: undefined }));
    const app = await buildApp({ deleteAccountHandler: handle });

    const response = await app.inject({
      method: 'DELETE',
      url: '/account',
      headers: { authorization: 'Bearer token', 'x-correlation-id': 'corr-delete' },
    });

    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ authorization: 'Bearer token', correlationId: 'corr-delete' }),
    );
    expect(response.statusCode).toBe(204);
    await app.close();
  });

  it('answers 500 problem details when the handler throws', async () => {
    const app = await buildApp({
      loginHandler: async () => {
        throw new Error('token issuer down');
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/login',
      headers: { 'x-correlation-id': 'corr-unhandled' },
      payload: { email: 'ada@example.com', password: 'senha1234' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toEqual({
      type: 'about:blank',
      status: 500,
      title: 'Internal server error',
      correlationId: 'corr-unhandled',
    });
    expect(response.body).not.toContain('token issuer down');
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
    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
    const app = await buildApp({
      logger,
      isReady: async () => ({ ready: false, reason: 'amqp disconnected' }),
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', reason: 'dependency unavailable' });
    expect(logger.warn).toHaveBeenCalledWith('readiness check reported not ready', {
      reason: 'amqp disconnected',
    });
  });

  it('answers 503 when the readiness check throws', async () => {
    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
    const failure = new Error('database down');
    const app = await buildApp({
      logger,
      isReady: async () => {
        throw failure;
      },
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', reason: 'dependency unavailable' });
    expect(logger.error).toHaveBeenCalledWith('readiness check failed', { err: failure });
  });

  it('answers 503 with dependency unavailable when a dependency is down and gives no reason', async () => {
    const app = await buildApp({
      isReady: async () => ({ ready: false }),
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', reason: 'dependency unavailable' });
  });

  it('answers 503 with dependency unavailable when the readiness check throws a non-error', async () => {
    const app = await buildApp({
      isReady: async () => {
        // Exercises the branch where the failure is not an Error.
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'offline';
      },
    });

    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'not_ready', reason: 'dependency unavailable' });
  });

  it('returns the prometheus text from the metrics registry', async () => {
    const app = await buildApp();

    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toContain('nodejs_version_info');
  });

  it('answers 500 plain text when metrics rendering fails', async () => {
    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;
    const failure = new Error('registry closed');
    const app = await buildApp({
      logger,
      renderMetrics: async () => {
        throw failure;
      },
    });

    const response = await app.inject({ method: 'GET', url: '/metrics' });

    expect(response.statusCode).toBe(500);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.body).toBe('metrics unavailable');
    expect(logger.error).toHaveBeenCalledWith('metrics render failed', { err: failure });
    await app.close();
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
