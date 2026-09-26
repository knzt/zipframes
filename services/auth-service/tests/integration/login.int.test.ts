import { jwtVerify } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startIdentityApp } from '../support/identity-app.js';
import type { IdentityApp } from '../support/identity-app.js';

const payload = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'senha1234',
};

describe('POST /login against Postgres', () => {
  let app: IdentityApp;

  beforeAll(async () => {
    app = await startIdentityApp();
  });

  afterAll(async () => {
    await app.stop();
  });

  it('returns a bearer token for the user created by register', async () => {
    const created = await fetch(`${app.baseUrl}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    expect(created.status).toBe(201);
    const registered = (await created.json()) as { userId: string };

    const loggedIn = await fetch(`${app.baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: payload.email, password: payload.password }),
    });
    expect(loggedIn.status).toBe(200);
    const session = (await loggedIn.json()) as {
      accessToken: string;
      tokenType: string;
      expiresIn: number;
    };
    expect(session.tokenType).toBe('Bearer');
    expect(session.expiresIn).toBeGreaterThan(0);

    const verified = await jwtVerify(session.accessToken, app.publicJwk, {
      issuer: 'https://auth.zipframes.test',
      audience: 'zipframes',
    });
    expect(verified.payload.sub).toBe(registered.userId);

    const live = await fetch(`${app.baseUrl}/health/live`);
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: 'ok' });

    const ready = await fetch(`${app.baseUrl}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: 'ready' });

    const metrics = await fetch(`${app.baseUrl}/metrics`);
    expect(metrics.status).toBe(200);
    expect(metrics.headers.get('content-type')).toMatch(/text\/plain/);

    const rejected = await fetch(`${app.baseUrl}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: payload.email, password: 'senha9999' }),
    });
    expect(rejected.status).toBe(401);
  });
});

describe('POST /register when event publish fails', () => {
  it('returns 201 and invokes onPublishFailed', async () => {
    let publishedError: unknown;
    let publishedDetails: { readonly userId: string; readonly correlationId: string } | undefined;
    const app = await startIdentityApp({
      eventPublisher: {
        publish: () => Promise.reject(new Error('broker down')),
      },
      onPublishFailed: (error, details) => {
        publishedError = error;
        publishedDetails = details;
      },
    });

    try {
      const created = await fetch(`${app.baseUrl}/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-correlation-id': '44444444-4444-4444-8444-444444444444',
        },
        body: JSON.stringify(payload),
      });
      expect(created.status).toBe(201);
      const body = (await created.json()) as { userId: string };
      expect(publishedError).toBeInstanceOf(Error);
      expect(publishedDetails).toEqual({
        userId: body.userId,
        correlationId: '44444444-4444-4444-8444-444444444444',
      });
    } finally {
      await app.stop();
    }
  });
});
