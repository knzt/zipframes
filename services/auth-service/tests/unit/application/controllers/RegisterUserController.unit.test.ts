import { ConflictError, ValidationError } from '@zipframes/core';
import { describe, expect, it, vi } from 'vitest';

import { RegisterUserController } from '../../../../src/application/controllers/RegisterUserController.js';
import type { RegisterUserUseCase } from '../../../../src/application/useCases/registerUser/RegisterUserUseCase.js';

const correlationId = 'corr-register';

const controllerFor = (execute: RegisterUserUseCase['execute']): RegisterUserController =>
  new RegisterUserController({ execute } as unknown as RegisterUserUseCase);

describe('RegisterUserController', () => {
  it('returns 201 and the parsed body when the use case succeeds', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      value: {
        userId: '0194f3a0-0000-7000-8000-000000000001',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    }));
    const controller = controllerFor(execute);

    const response = await controller.handle({
      correlationId,
      body: { name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha1234' },
    });

    expect(execute).toHaveBeenCalledWith({
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
  });

  it('returns 400 when the use case rejects the input', async () => {
    const execute = vi.fn(async () => ({
      ok: false as const,
      error: new ValidationError('INVALID_INPUT', 'password needs a digit'),
    }));
    const controller = controllerFor(execute);

    const response = await controller.handle({
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
    const execute = vi.fn(async () => ({
      ok: false as const,
      error: new ConflictError('EMAIL_TAKEN', 'email is already registered'),
    }));
    const controller = controllerFor(execute);

    const response = await controller.handle({
      correlationId,
      body: { name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha1234' },
    });

    expect(response).toMatchObject({
      status: 409,
      contentType: 'application/problem+json',
      body: {
        title: 'Email already registered',
        correlationId,
      },
    });
  });

  it('throws when the use case returns an unexpected error', async () => {
    const execute = vi.fn(async () => ({
      ok: false as const,
      error: new Error('unexpected'),
    }));
    const controller = controllerFor(execute);

    await expect(
      controller.handle({
        correlationId,
        body: { name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha1234' },
      }),
    ).rejects.toThrow('unexpected register failure');
  });
});
