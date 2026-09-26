import { ConflictError, ValidationError } from '@zipframes/core';
import type { HttpReply, HttpRequest } from '@zipframes/http';
import { describe, expect, it, vi } from 'vitest';

import type { RegisterUserController } from '../../../../../src/application/controllers/RegisterUserController.js';
import { createRegisterUserHandler } from '../../../../../src/infrastructure/http/handlers/registerUserHandler.js';

const correlationId = 'corr-register';

const handlerFor = (
  handle: RegisterUserController['handle'],
): ((request: HttpRequest) => Promise<HttpReply>) =>
  createRegisterUserHandler({ handle } as unknown as RegisterUserController);

describe('createRegisterUserHandler', () => {
  it('returns 201 and the parsed body when the controller succeeds', async () => {
    const handle = vi.fn(async () => ({
      ok: true as const,
      value: {
        userId: '0194f3a0-0000-7000-8000-000000000001',
        name: 'Ada Lovelace',
        email: 'ada@example.com',
      },
    }));
    const handler = handlerFor(handle);

    const response = await handler({
      correlationId,
      body: { name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha1234' },
    });

    expect(handle).toHaveBeenCalledWith(
      { name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha1234' },
      { correlationId },
    );
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
    const handle = vi.fn();
    const handler = handlerFor(handle);

    const response = await handler({
      correlationId,
      body: { name: '', email: 'not-an-email', password: 'x' },
    });

    expect(handle).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      status: 400,
      contentType: 'application/problem+json',
      body: { status: 400, correlationId },
    });
    expect(response.body).not.toHaveProperty('detail');
  });

  it('returns 400 when the controller rejects the input', async () => {
    const handle = vi.fn(async () => ({
      ok: false as const,
      error: new ValidationError('NO_DIGIT', 'password must contain at least one digit'),
    }));
    const handler = handlerFor(handle);

    const response = await handler({
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
    const handle = vi.fn(async () => ({
      ok: false as const,
      error: new ConflictError('EMAIL_TAKEN', 'email is already registered'),
    }));
    const handler = handlerFor(handle);

    const response = await handler({
      correlationId,
      body: { name: 'Ada Lovelace', email: 'ada@example.com', password: 'senha1234' },
    });

    expect(response).toMatchObject({
      status: 409,
      contentType: 'application/problem+json',
      body: {
        title: 'email is already registered',
        correlationId,
      },
    });
    expect(response.body).not.toHaveProperty('detail');
  });
});
