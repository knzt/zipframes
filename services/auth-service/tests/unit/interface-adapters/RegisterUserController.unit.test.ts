import { ConflictError, ValidationError } from '@zipframes/core';
import { describe, expect, it, vi } from 'vitest';

import { RegisterUserController } from '../../../src/interface-adapters/RegisterUserController.js';
import type { RegisterUserUseCase } from '../../../src/application/useCases/registerUser/RegisterUserUseCase.js';

const correlationId = 'corr-register';
const payload = { name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha1234' };

const controllerFor = (execute: RegisterUserUseCase['execute']): RegisterUserController =>
  new RegisterUserController({ execute } as unknown as RegisterUserUseCase);

describe('RegisterUserController', () => {
  it('forwards the payload and correlation id to the use case', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      value: {
        userId: '0194f3a0-0000-7000-8000-000000000001',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    }));
    const controller = controllerFor(execute);

    const result = await controller.handle(payload, { correlationId });

    expect(execute).toHaveBeenCalledWith({ ...payload, correlationId });
    expect(result).toEqual({
      ok: true,
      value: {
        userId: '0194f3a0-0000-7000-8000-000000000001',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    });
  });

  it('returns the use case error when registration is rejected', async () => {
    const error = new ValidationError('NO_DIGIT', 'password must contain at least one digit');
    const execute = vi.fn(async () => ({ ok: false as const, error }));
    const controller = controllerFor(execute);

    const result = await controller.handle(
      { name: 'Ada Lovelace', email: 'ada@example.com', password: 'abcdefgh' },
      { correlationId },
    );

    expect(result).toEqual({ ok: false, error });
  });

  it('returns EMAIL_TAKEN from the use case', async () => {
    const error = new ConflictError('EMAIL_TAKEN', 'email is already registered');
    const execute = vi.fn(async () => ({ ok: false as const, error }));
    const controller = controllerFor(execute);

    const result = await controller.handle(payload, { correlationId });

    expect(result).toEqual({ ok: false, error });
  });
});
