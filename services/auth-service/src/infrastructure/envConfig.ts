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

export type EnvConfig = z.infer<typeof configSchema>;

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

const formatZodError = (error: z.ZodError): Error => {
  const issue = error.issues[0];
  const path = issue?.path[0];
  const field =
    path === 'databaseUrl'
      ? 'AUTH_DATABASE_URL'
      : path === 'amqpUrl'
        ? 'AMQP_URL'
        : path === 'jwtPrivateKeyPem'
          ? 'JWT_PRIVATE_KEY_PEM'
          : path === 'jwtKid'
            ? 'JWT_KID'
            : path === 'jwtIssuer'
              ? 'JWT_ISSUER'
              : path === 'jwtAudience'
                ? 'JWT_AUDIENCE'
                : path === 'port'
                  ? 'PORT'
                  : path === 'logLevel'
                    ? 'LOG_LEVEL'
                    : String(path);
  return new Error(`invalid environment variable: ${field}`);
};

export const loadEnvConfig = (env: NodeJS.ProcessEnv = process.env): EnvConfig => {
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
