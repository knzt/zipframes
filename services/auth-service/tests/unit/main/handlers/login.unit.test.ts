import type { HttpReply, HttpRequest } from '@zipframes/http';
import { describe, expect, it, vi } from 'vitest';

import { invalidCredentials } from '../../../../src/application/useCases/login/LoginUseCase.js';
import type { LoginController } from '../../../../src/interface-adapters/LoginController.js';
import { loginHandler } from '../../../../src/main/handlers/login.js';

const correlationId = 'corr-login';

const handlerFor = (
  handle: LoginController['handle'],
): ((request: HttpRequest) => Promise<HttpReply>) =>
  loginHandler({ handle } as unknown as LoginController).handle;

describe('loginHandler', () => {
  it('returns 200 and the parsed token when the controller succeeds', async () => {
    const handle = vi.fn(async () => ({
      ok: true as const,
      value: { accessToken: 'token', tokenType: 'Bearer' as const, expiresIn: 900 },
    }));
    const handler = handlerFor(handle);

    const response = await handler({
      correlationId,
      body: { email: 'ada@example.com', password: 'senha1234' },
    });

    expect(handle).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'senha1234' });
    expect(response).toEqual({
      status: 200,
      body: { accessToken: 'token', tokenType: 'Bearer', expiresIn: 900 },
    });
  });

  it('returns 401 for a malformed body without calling the controller', async () => {
    const handle = vi.fn();
    const handler = handlerFor(handle);

    const response = await handler({
      correlationId,
      body: { email: 'not-an-email' },
    });

    expect(handle).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      status: 401,
      contentType: 'application/problem+json',
      body: { title: invalidCredentials.message, correlationId },
    });
    expect(response.body).not.toHaveProperty('detail');
  });

  it('returns 401 when the controller rejects the credentials', async () => {
    const handle = vi.fn(async () => ({
      ok: false as const,
      error: invalidCredentials,
    }));
    const handler = handlerFor(handle);

    const response = await handler({
      correlationId,
      body: { email: 'ada@example.com', password: 'senha1234' },
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      title: invalidCredentials.message,
      correlationId,
    });
    expect(response.body).not.toHaveProperty('detail');
  });
});
