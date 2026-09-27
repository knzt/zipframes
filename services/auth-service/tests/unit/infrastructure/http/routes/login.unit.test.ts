import { describe, expect, it, vi } from 'vitest';

import type { LoginController } from '../../../../../src/interface-adapters/LoginController.js';
import { loginRoute } from '../../../../../src/infrastructure/http/routes/login.js';

describe('loginRoute', () => {
  it('declares POST /login and delegates the request to the controller', async () => {
    const reply = { status: 200, body: { accessToken: 'token' } };
    const handle = vi.fn(async () => reply);
    const route = loginRoute({ handle } as unknown as LoginController);
    const request = { correlationId: 'corr-login', body: { email: 'ada@example.com' } };

    const response = await route.handle(request);

    expect(route.method).toBe('POST');
    expect(route.path).toBe('/login');
    expect(handle).toHaveBeenCalledWith(request);
    expect(response).toBe(reply);
  });
});
