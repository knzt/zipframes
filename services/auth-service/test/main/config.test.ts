import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/main/config.js';

const REQUIRED_VARS = {
  AUTH_DATABASE_URL: 'postgresql://localhost/auth_db',
  AMQP_URL: 'amqp://localhost',
  JWT_PRIVATE_KEY_PEM: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
  JWT_KID: 'key-1',
  JWT_ISSUER: 'https://auth.zipframes.test',
  JWT_AUDIENCE: 'zipframes',
};

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv, ...REQUIRED_VARS };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('loadConfig', () => {
  it('reads every required variable', () => {
    const config = loadConfig();

    expect(config).toMatchObject({
      databaseUrl: REQUIRED_VARS.AUTH_DATABASE_URL,
      amqpUrl: REQUIRED_VARS.AMQP_URL,
      jwtKid: 'key-1',
      jwtIssuer: REQUIRED_VARS.JWT_ISSUER,
      jwtAudience: REQUIRED_VARS.JWT_AUDIENCE,
    });
  });

  it('defaults port, corsOrigin and outboxIntervalMs when not set', () => {
    const config = loadConfig();

    expect(config.port).toBe(3000);
    expect(config.corsOrigin).toBe('*');
    expect(config.outboxIntervalMs).toBe(2000);
  });

  it('honours overrides for the optional variables', () => {
    process.env.PORT = '4000';
    process.env.CORS_ORIGIN = 'https://app.zipframes.test';
    process.env.OUTBOX_INTERVAL_MS = '5000';

    const config = loadConfig();

    expect(config.port).toBe(4000);
    expect(config.corsOrigin).toBe('https://app.zipframes.test');
    expect(config.outboxIntervalMs).toBe(5000);
  });

  it.each(Object.keys(REQUIRED_VARS))('throws when %s is missing', (missingVar) => {
    delete process.env[missingVar];

    expect(() => loadConfig()).toThrow(missingVar);
  });
});
