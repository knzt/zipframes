import { describe, expect, it, vi } from 'vitest';

import { makeLoginController } from '../../../../src/application/controllers/login.controller.js';

const correlationId = 'corr-login';

describe('login controller', () => {
  it('returns 200 and the parsed token when the use case succeeds', async () => {
    const login = vi.fn(async () => ({
      ok: true as const,
      value: { accessToken: 'token', tokenType: 'Bearer' as const, expiresIn: 900 },
    }));
    const handle = makeLoginController(login);

    const response = await handle({
      correlationId,
      body: { email: 'ada@example.com', password: 'senha1234' },
    });

    expect(login).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'senha1234' });
    expect(response).toEqual({
      status: 200,
      body: { accessToken: 'token', tokenType: 'Bearer', expiresIn: 900 },
    });
  });

  it('returns 401 for a malformed body without calling the use case', async () => {
    const login = vi.fn();
    const handle = makeLoginController(login);

    const response = await handle({
      correlationId,
      body: { email: 'not-an-email' },
    });

    expect(login).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect(response.contentType).toBe('application/problem+json');
    expect(response.body).toMatchObject({ title: 'Invalid credentials', correlationId });
    expect(response.body).not.toHaveProperty('detail');
  });

  it('returns 401 when the use case rejects the credentials', async () => {
    const login = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'INVALID_CREDENTIALS' as const, message: 'invalid email or password' },
    }));
    const handle = makeLoginController(login);

    const response = await handle({
      correlationId,
      body: { email: 'ada@example.com', password: 'senha1234' },
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ title: 'Invalid credentials', correlationId });
  });
});
