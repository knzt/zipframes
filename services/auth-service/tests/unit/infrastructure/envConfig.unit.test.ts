import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadEnvConfig } from '../../../src/infrastructure/envConfig.js';

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
  delete process.env.JWT_PRIVATE_KEY_FILE;
  delete process.env.LOG_LEVEL;
  delete process.env.SERVICE_VERSION;
  delete process.env.PORT;
  delete process.env.CORS_ORIGIN;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('loadEnvConfig', () => {
  it('reads every required variable', () => {
    const config = loadEnvConfig();

    expect(config).toMatchObject({
      databaseUrl: REQUIRED_VARS.AUTH_DATABASE_URL,
      amqpUrl: REQUIRED_VARS.AMQP_URL,
      jwtKid: 'key-1',
      jwtIssuer: REQUIRED_VARS.JWT_ISSUER,
      jwtAudience: REQUIRED_VARS.JWT_AUDIENCE,
      logLevel: 'info',
      serviceVersion: '0.1.0',
    });
  });

  it('defaults port and cors when not set', () => {
    const config = loadEnvConfig();

    expect(config.port).toBe(3000);
    expect(config.corsOrigin).toBe('*');
  });

  it('honours overrides for the optional variables', () => {
    process.env.PORT = '4000';
    process.env.CORS_ORIGIN = 'https://app.zipframes.test';
    process.env.LOG_LEVEL = 'debug';
    process.env.SERVICE_VERSION = '1.2.3';

    const config = loadEnvConfig();

    expect(config.port).toBe(4000);
    expect(config.corsOrigin).toBe('https://app.zipframes.test');
    expect(config.logLevel).toBe('debug');
    expect(config.serviceVersion).toBe('1.2.3');
  });

  it('reads the private key from a file when the PEM variable is absent', () => {
    delete process.env.JWT_PRIVATE_KEY_PEM;
    const directory = mkdtempSync(path.join(tmpdir(), 'auth-jwt-'));
    const file = path.join(directory, 'key.pem');
    writeFileSync(file, 'from-file');
    process.env.JWT_PRIVATE_KEY_FILE = file;

    expect(loadEnvConfig().jwtPrivateKeyPem).toBe('from-file');
  });

  it('throws when AUTH_DATABASE_URL is missing', () => {
    delete process.env.AUTH_DATABASE_URL;

    expect(() => loadEnvConfig()).toThrow('AUTH_DATABASE_URL');
  });

  it('throws when AMQP_URL is missing', () => {
    delete process.env.AMQP_URL;

    expect(() => loadEnvConfig()).toThrow('AMQP_URL');
  });

  it('throws when JWT_PRIVATE_KEY_PEM is missing', () => {
    delete process.env.JWT_PRIVATE_KEY_PEM;

    expect(() => loadEnvConfig()).toThrow('JWT_PRIVATE_KEY_PEM');
  });

  it('throws when JWT_KID is missing', () => {
    delete process.env.JWT_KID;

    expect(() => loadEnvConfig()).toThrow('JWT_KID');
  });

  it('throws when JWT_ISSUER is missing', () => {
    delete process.env.JWT_ISSUER;

    expect(() => loadEnvConfig()).toThrow('JWT_ISSUER');
  });

  it('throws when JWT_AUDIENCE is missing', () => {
    delete process.env.JWT_AUDIENCE;

    expect(() => loadEnvConfig()).toThrow('JWT_AUDIENCE');
  });

  it('rejects a non-positive port', () => {
    process.env.PORT = '0';

    expect(() => loadEnvConfig()).toThrow('PORT');
  });

  it('rejects an empty private key file', () => {
    delete process.env.JWT_PRIVATE_KEY_PEM;
    const directory = mkdtempSync(path.join(tmpdir(), 'auth-jwt-'));
    const file = path.join(directory, 'key.pem');
    writeFileSync(file, '');
    process.env.JWT_PRIVATE_KEY_FILE = file;

    expect(() => loadEnvConfig()).toThrow('JWT_PRIVATE_KEY_PEM');
  });

  it('coerces a numeric port', () => {
    const config = loadEnvConfig({
      ...process.env,
      PORT: 4100 as unknown as string,
    });

    expect(config.port).toBe(4100);
  });

  it('names an unexpected field when the value is not a string', () => {
    expect(() =>
      loadEnvConfig({
        ...process.env,
        SERVICE_VERSION: { length: 1 } as unknown as string,
      }),
    ).toThrow('serviceVersion');
  });

  it('rejects a non-numeric port', () => {
    process.env.PORT = 'abc';

    expect(() => loadEnvConfig()).toThrow('PORT');
  });

  it('treats a blank port as the default', () => {
    process.env.PORT = '';

    expect(loadEnvConfig().port).toBe(3000);
  });

  it('rejects an unknown log level', () => {
    process.env.LOG_LEVEL = 'verbose';

    expect(() => loadEnvConfig()).toThrow('LOG_LEVEL');
  });
});
