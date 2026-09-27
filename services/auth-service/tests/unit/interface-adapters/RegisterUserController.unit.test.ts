import { ConflictError, ValidationError } from '@zipframes/core';
import { describe, expect, it, vi } from 'vitest';

import type { RegisterUserUseCase } from '../../../src/application/useCases/registerUser/RegisterUserUseCase.js';
import { RegisterUserController } from '../../../src/interface-adapters/RegisterUserController.js';

const correlationId = 'corr-register';
const payload = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha1234' };

const controllerFor = (execute: RegisterUserUseCase['execute']): RegisterUserController =>
  new RegisterUserController({ execute } as unknown as RegisterUserUseCase);

describe('RegisterUserController', () => {
  it('returns 201 and forwards the payload with the correlation id', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      value: {
        userId: '0194f3a0-0000-7000-8000-000000000001',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    }));
    const controller = controllerFor(execute);

    const response = await controller.handle({ correlationId, body: payload });

    expect(execute).toHaveBeenCalledWith({ ...payload, correlationId });
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
    const execute = vi.fn();
    const controller = controllerFor(execute);

    const response = await controller.handle({
      correlationId,
      body: { name: '', email: 'not-an-email', password: 'x' },
    });

    expect(execute).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      status: 400,
      contentType: 'application/problem+json',
      body: { status: 400, correlationId },
    });
    expect(response.body).not.toHaveProperty('detail');
  });

  it('returns 400 when the use case rejects the input', async () => {
    const execute = vi.fn(async () => ({
      ok: false as const,
      error: new ValidationError('NO_DIGIT', 'password must contain at least one digit'),
    }));
    const controller = controllerFor(execute);

    const response = await controller.handle({
      correlationId,
      body: { name: 'Ada Lovelace', email: 'ada@example.com', password: 'abcdefgh' },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      title: 'password must contain at least one digit',
      correlationId,
    });
    expect(response.body).not.toHaveProperty('detail');
  });

  it('returns 409 when the email is already registered', async () => {
    const execute = vi.fn(async () => ({
      ok: false as const,
      error: new ConflictError('EMAIL_TAKEN', 'email is already registered'),
    }));
    const controller = controllerFor(execute);

    const response = await controller.handle({ correlationId, body: payload });

    expect(response).toMatchObject({
      status: 409,
      contentType: 'application/problem+json',
      body: { title: 'email is already registered', correlationId },
    });
    expect(response.body).not.toHaveProperty('detail');
  });
});
