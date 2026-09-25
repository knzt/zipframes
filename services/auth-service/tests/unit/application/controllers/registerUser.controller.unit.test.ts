import { describe, expect, it, vi } from 'vitest';

import { makeRegisterUserController } from '../../../../src/application/controllers/registerUser.controller.js';
import type { makeRegisterUser } from '../../../../src/application/useCases/registerUser/registerUser.useCase.js';

const correlationId = 'corr-register';

const controllerFor = (
  registerUser: ReturnType<typeof makeRegisterUser>,
): ReturnType<typeof makeRegisterUserController> => makeRegisterUserController(registerUser);

describe('registerUser controller', () => {
  it('returns 201 and the parsed body when the use case succeeds', async () => {
    const registerUser = vi.fn(async () => ({
      ok: true as const,
      value: {
        userId: '0194f3a0-0000-7000-8000-000000000001',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    }));
    const handle = controllerFor(registerUser);

    const response = await handle({
      correlationId,
      body: { name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha1234' },
    });

    expect(registerUser).toHaveBeenCalledWith({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'senha1234',
      correlationId,
    });
    expect(response).toEqual({
      status: 201,
      body: {
        userId: '0194f3a0-0000-7000-8000-000000000001',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    });
  });

  it('returns 400 problem details for a body the schema rejects', async () => {
    const registerUser = vi.fn();
    const handle = controllerFor(registerUser);

    const response = await handle({
      correlationId,
      body: { name: '', email: 'not-an-email', password: 'x' },
    });

    expect(registerUser).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    expect(response.contentType).toBe('application/problem+json');
    expect(response.body).toMatchObject({ status: 400, correlationId });
  });

  it('returns 400 when the use case rejects the input', async () => {
    const registerUser = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'INVALID_INPUT' as const, message: 'password needs a digit' },
    }));
    const handle = controllerFor(registerUser);

    const response = await handle({
      correlationId,
      body: { name: 'Ada Lovelace', email: 'ada@example.com', password: 'abcdefgh' },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      title: 'Invalid request body',
      detail: 'password needs a digit',
      correlationId,
    });
  });

  it('returns 409 when the email is already registered', async () => {
    const registerUser = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'EMAIL_TAKEN' as const, message: 'email is already registered' },
    }));
    const handle = controllerFor(registerUser);

    const response = await handle({
      correlationId,
      body: { name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha1234' },
    });

    expect(response.status).toBe(409);
    expect(response.contentType).toBe('application/problem+json');
    expect(response.body).toMatchObject({
      title: 'Email already registered',
      correlationId,
    });
  });
});
