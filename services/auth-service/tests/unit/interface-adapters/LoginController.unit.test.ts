import { describe, expect, it, vi } from 'vitest';

import { invalidCredentials } from '../../../src/application/useCases/login/LoginUseCase.js';
import type { LoginUseCase } from '../../../src/application/useCases/login/LoginUseCase.js';
import { LoginController } from '../../../src/interface-adapters/LoginController.js';

const correlationId = 'corr-login';

const controllerFor = (execute: LoginUseCase['execute']): LoginController =>
  new LoginController({ execute } as unknown as LoginUseCase);

describe('LoginController', () => {
  it('returns 200 and the parsed token when the use case succeeds', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      value: { accessToken: 'token', tokenType: 'Bearer' as const, expiresIn: 900 },
    }));
    const controller = controllerFor(execute);

    const response = await controller.handle({
      correlationId,
      body: { email: 'ada@example.com', password: 'senha1234' },
    });

    expect(execute).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'senha1234' });
    expect(response).toEqual({
      status: 200,
      body: { accessToken: 'token', tokenType: 'Bearer', expiresIn: 900 },
    });
  });

  it('returns 401 for a malformed body without calling the use case', async () => {
    const execute = vi.fn();
    const controller = controllerFor(execute);

    const response = await controller.handle({
      correlationId,
      body: { email: 'not-an-email' },
    });

    expect(execute).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      status: 401,
      contentType: 'application/problem+json',
      body: { title: invalidCredentials.message, correlationId },
    });
    expect(response.body).not.toHaveProperty('detail');
  });

  it('returns 401 when the use case rejects the credentials', async () => {
    const execute = vi.fn(async () => ({
      ok: false as const,
      error: invalidCredentials,
    }));
    const controller = controllerFor(execute);

    const response = await controller.handle({
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
