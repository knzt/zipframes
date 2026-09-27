import { describe, expect, it, vi } from 'vitest';

import { LoginController } from '../../../src/interface-adapters/LoginController.js';
import { invalidCredentials } from '../../../src/application/useCases/login/LoginUseCase.js';
import type { LoginUseCase } from '../../../src/application/useCases/login/LoginUseCase.js';

const payload = { email: 'ada@example.com', password: 'senha1234' };

const controllerFor = (execute: LoginUseCase['execute']): LoginController =>
  new LoginController({ execute } as unknown as LoginUseCase);

describe('LoginController', () => {
  it('forwards the payload to the use case', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      value: { accessToken: 'token', tokenType: 'Bearer' as const, expiresIn: 900 },
    }));
    const controller = controllerFor(execute);

    const result = await controller.handle(payload);

    expect(execute).toHaveBeenCalledWith(payload);
    expect(result).toEqual({
      ok: true,
      value: { accessToken: 'token', tokenType: 'Bearer', expiresIn: 900 },
    });
  });

  it('returns the use case error when credentials are rejected', async () => {
    const execute = vi.fn(async () => ({
      ok: false as const,
      error: invalidCredentials,
    }));
    const controller = controllerFor(execute);

    const result = await controller.handle(payload);

    expect(result).toEqual({ ok: false, error: invalidCredentials });
  });
});
