import { readFileSync } from 'node:fs';

import { LOG_LEVELS, type LogLevel } from '@zipframes/logger';

export interface Config {
  readonly port: number;
  readonly corsOrigin: string;
  readonly databaseUrl: string;
  readonly amqpUrl: string;
  readonly jwtPrivateKeyPem: string;
  readonly jwtKid: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly outboxIntervalMs: number;
  readonly outboxMaxAttempts: number;
  readonly logLevel: LogLevel;
  readonly serviceVersion: string;
}

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
};

const positiveInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid environment variable: ${name}`);
  }
  return parsed;
};

const logLevel = (): LogLevel => {
  const raw = process.env.LOG_LEVEL ?? 'info';
  if ((LOG_LEVELS as readonly string[]).includes(raw)) {
    return raw as LogLevel;
  }
  throw new Error('invalid environment variable: LOG_LEVEL');
};

const jwtPrivateKeyPem = (): string => {
  const inline = process.env.JWT_PRIVATE_KEY_PEM;
  if (inline !== undefined && inline.length > 0) {
    return inline;
  }
  const file = process.env.JWT_PRIVATE_KEY_FILE;
  if (file === undefined || file.length === 0) {
    throw new Error('missing required environment variable: JWT_PRIVATE_KEY_PEM');
  }
  return readFileSync(file, 'utf8');
};

export const loadConfig = (): Config => ({
  port: positiveInt('PORT', 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  databaseUrl: required('AUTH_DATABASE_URL'),
  amqpUrl: required('AMQP_URL'),
  jwtPrivateKeyPem: jwtPrivateKeyPem(),
  jwtKid: required('JWT_KID'),
  jwtIssuer: required('JWT_ISSUER'),
  jwtAudience: required('JWT_AUDIENCE'),
  outboxIntervalMs: positiveInt('OUTBOX_INTERVAL_MS', 2000),
  outboxMaxAttempts: positiveInt('OUTBOX_MAX_ATTEMPTS', 30),
  logLevel: logLevel(),
  serviceVersion: process.env.SERVICE_VERSION ?? '0.1.0',
});
