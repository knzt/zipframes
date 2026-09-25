import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startIdentityApp } from '../support/identity-app.js';
import type { IdentityApp } from '../support/identity-app.js';

const payload = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'senha1234',
};

describe('POST /register against Postgres', () => {
  let app: IdentityApp;

  beforeAll(async () => {
    app = await startIdentityApp();
  });

  afterAll(async () => {
    await app.stop();
  });

  it('persists the user and the outbox row in one transaction', async () => {
    const created = await fetch(`${app.baseUrl}/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-correlation-id': '33333333-3333-4333-8333-333333333333',
      },
      body: JSON.stringify(payload),
    });

    expect(created.status).toBe(201);
    const body = (await created.json()) as { userId: string; email: string; name: string };
    expect(body).toMatchObject({ name: payload.name, email: payload.email });

    const user = await app.prisma.user.findUnique({ where: { email: payload.email } });
    expect(user?.id).toBe(body.userId);
    const outbox = await app.prisma.outboxEvent.findFirst({ where: { aggregateId: body.userId } });
    expect(outbox).toMatchObject({
      aggregateType: 'User',
      aggregateId: body.userId,
      eventType: 'user.registered',
      version: 1,
      correlationId: '33333333-3333-4333-8333-333333333333',
      payload: {
        userId: body.userId,
        name: payload.name,
        email: payload.email,
      },
    });
    expect(outbox?.publishedAt).toBeNull();

    const duplicate = await fetch(`${app.baseUrl}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(duplicate.status).toBe(409);
    expect(await app.prisma.user.count()).toBe(1);
    expect(await app.prisma.outboxEvent.count()).toBe(1);
  });
});
