import { describe, expect, it, vi } from 'vitest';

import type { RegisterUserController } from '../../../../../src/interface-adapters/RegisterUserController.js';
import { registerUserRoute } from '../../../../../src/infrastructure/http/routes/registerUser.js';

describe('registerUserRoute', () => {
  it('declares POST /register and delegates the request to the controller', async () => {
    const reply = { status: 201, body: { userId: 'user-1' } };
    const handle = vi.fn(async () => reply);
    const route = registerUserRoute({ handle } as unknown as RegisterUserController);
    const request = { correlationId: 'corr-register', body: { name: 'Ada' } };

    const response = await route.handle(request);

    expect(route.method).toBe('POST');
    expect(route.path).toBe('/register');
    expect(handle).toHaveBeenCalledWith(request);
    expect(response).toBe(reply);
  });
});
