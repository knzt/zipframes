import { readFileSync } from 'node:fs';

import { LOG_LEVELS, type LogLevel } from '@zipframes/logger';
import { z } from 'zod';

const emptyToUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value.length === 0 ? undefined : value;

const positiveIntFromEnv = z.preprocess((value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }
  return emptyToUndefined(value);
}, z.coerce.number().int().positive());

const configSchema = z.object({
  port: positiveIntFromEnv,
  corsOrigin: z.string().min(1),
  databaseUrl: z.string().min(1),
  amqpUrl: z.string().min(1),
  jwtPrivateKeyPem: z.string().min(1),
  jwtKid: z.string().min(1),
  jwtIssuer: z.string().min(1),
  jwtAudience: z.string().min(1),
  logLevel: z.enum(LOG_LEVELS as unknown as [LogLevel, ...LogLevel[]]),
  serviceVersion: z.string().min(1),
});

export type Config = z.infer<typeof configSchema>;

const ENV_BY_FIELD: Record<string, string> = {
  port: 'PORT',
  corsOrigin: 'CORS_ORIGIN',
  databaseUrl: 'AUTH_DATABASE_URL',
  amqpUrl: 'AMQP_URL',
  jwtPrivateKeyPem: 'JWT_PRIVATE_KEY_PEM',
  jwtKid: 'JWT_KID',
  jwtIssuer: 'JWT_ISSUER',
  jwtAudience: 'JWT_AUDIENCE',
  logLevel: 'LOG_LEVEL',
  serviceVersion: 'SERVICE_VERSION',
};

const resolveJwtPrivateKeyPem = (env: NodeJS.ProcessEnv): string => {
  const inline = env.JWT_PRIVATE_KEY_PEM;
  if (inline !== undefined && inline.length > 0) {
    return inline;
  }
  const file = env.JWT_PRIVATE_KEY_FILE;
  if (file === undefined || file.length === 0) {
    throw new Error('missing required environment variable: JWT_PRIVATE_KEY_PEM');
  }
  return readFileSync(file, 'utf8');
};

export const formatZodError = (error: z.ZodError): Error => {
  const path = error.issues[0]?.path[0];
  const field = ENV_BY_FIELD[String(path)] ?? String(path);
  return new Error(`invalid environment variable: ${field}`);
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  try {
    return configSchema.parse({
      port: emptyToUndefined(env.PORT) ?? '3000',
      corsOrigin: emptyToUndefined(env.CORS_ORIGIN) ?? '*',
      databaseUrl: env.AUTH_DATABASE_URL,
      amqpUrl: env.AMQP_URL,
      jwtPrivateKeyPem: resolveJwtPrivateKeyPem(env),
      jwtKid: env.JWT_KID,
      jwtIssuer: env.JWT_ISSUER,
      jwtAudience: env.JWT_AUDIENCE,
      logLevel: emptyToUndefined(env.LOG_LEVEL) ?? 'info',
      serviceVersion: emptyToUndefined(env.SERVICE_VERSION) ?? '0.1.0',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw formatZodError(error);
    }
    throw error;
  }
};
