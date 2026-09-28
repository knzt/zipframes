import { createRemoteJWKSet, jwtVerify } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AUDIENCE,
  ISSUER,
  startAuthServiceUnderTest,
  type AuthServiceUnderTest,
} from '../support/auth-service.js';

const payload = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'senha1234',
};

const post = (service: AuthServiceUnderTest, pathname: string, body: unknown): Promise<Response> =>
  fetch(`${service.url}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /login against Postgres', () => {
  let service: AuthServiceUnderTest;

  beforeAll(async () => {
    service = await startAuthServiceUnderTest();
  }, 180_000);

  afterAll(async () => {
    await service.stop();
  });

  it('returns a token that the published JWKS verifies, for the user created by register', async () => {
    const created = await post(service, '/register', payload);
    expect(created.status).toBe(201);
    const registered = (await created.json()) as { userId: string };

    const loggedIn = await post(service, '/login', {
      email: payload.email,
      password: payload.password,
    });
    expect(loggedIn.status).toBe(200);
    const session = (await loggedIn.json()) as {
      accessToken: string;
      tokenType: string;
      expiresIn: number;
    };
    expect(session.tokenType).toBe('Bearer');
    expect(session.expiresIn).toBeGreaterThan(0);

    // The same path the other services take: fetch the keys, then verify.
    const jwks = createRemoteJWKSet(new URL(`${service.url}/.well-known/jwks.json`));
    const verified = await jwtVerify(session.accessToken, jwks, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    expect(verified.payload.sub).toBe(registered.userId);
  });

  it('answers 401 for a wrong password', async () => {
    const rejected = await post(service, '/login', {
      email: payload.email,
      password: 'senha9999',
    });

    expect(rejected.status).toBe(401);
  });

  it('exposes liveness, readiness and metrics', async () => {
    const live = await fetch(`${service.url}/health/live`);
    const ready = await fetch(`${service.url}/health/ready`);
    const metrics = await fetch(`${service.url}/metrics`);

    expect(await live.json()).toEqual({ status: 'ok' });
    expect(await ready.json()).toEqual({ status: 'ready' });
    expect(metrics.headers.get('content-type')).toMatch(/text\/plain/u);
  });
});

describe('POST /register when the broker is down', () => {
  let service: AuthServiceUnderTest;

  beforeAll(async () => {
    service = await startAuthServiceUnderTest();
  }, 180_000);

  afterAll(async () => {
    await service.stop();
  });

  it('still registers the user and reports itself not ready', async () => {
    await service.stopBroker();

    const created = await post(service, '/register', payload);

    expect(created.status).toBe(201);
    const { userId } = (await created.json()) as { userId: string };
    expect((await service.prisma.user.findUnique({ where: { id: userId } }))?.email).toBe(
      payload.email,
    );
    expect((await fetch(`${service.url}/health/ready`)).status).toBe(503);
  });
});
